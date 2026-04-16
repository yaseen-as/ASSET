import axios from 'axios';
import zlib from 'zlib';
import { promisify } from 'util';
import Redis from 'ioredis';
import { SymbolMasterRepository, type SymbolRow } from './symbol-master.repository';
import { config } from '../config';
import { logger } from '../utils/logger';

const gunzip = promisify(zlib.gunzip);

const CACHE_PREFIX = 'symbol:';
const CACHE_TTL = 86400; // 24h

export interface SymbolInfo {
  symbol: string;
  exchange: string;
  instrumentKey: string;  // Upstox instrument key, e.g. "NSE_EQ|INE009A01021"
  tradingSymbol: string;
  instrumentType: string;
  lotSize: number;
  tickSize: number;
  isin: string;
  expiry?: string;
  strike?: number;
}

/**
 * Instrument master for Upstox — downloads the CSV from Upstox's public endpoint,
 * parses it, upserts into `broker.symbol_master`, and caches lookups in Redis.
 *
 * Upstox instrument key format: `{exchange_segment}|{instrument_key}`
 *   e.g. "NSE_EQ|INE009A01021" for INFOSYS
 *   e.g. "NSE_EQ|RELIANCE"    for RELIANCE
 */
export class UpstoxInstrumentService {
  private repo = new SymbolMasterRepository();
  private redis: Redis;

  constructor() {
    this.redis = new Redis(config.redis.url);
  }

  async fetchAndSync(): Promise<{ total: number; updated: number }> {
    const url = config.upstox.instrumentUrl;
    logger.info(`[Instruments] Fetching from ${url}...`);

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 120_000,
    });

    // Upstox serves gzipped CSV
    let csvText: string;
    try {
      const buf = await gunzip(response.data);
      csvText = buf.toString('utf-8');
    } catch {
      // Might not be gzipped in some environments
      csvText = Buffer.from(response.data).toString('utf-8');
    }

    const lines = csvText.split('\n');
    const header = lines[0]?.split(',') || [];

    const col = (name: string) => header.indexOf(name);
    const iKey = col('instrument_key');
    const iExch = col('exchange');
    const iSymbol = col('tradingsymbol');
    const iName = col('name');
    const iType = col('instrument_type');
    const iLot = col('lot_size');
    const iTick = col('tick_size');
    const iIsin = col('isin');
    const iExpiry = col('expiry');
    const iStrike = col('strike');

    const rows: Partial<SymbolRow>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length < header.length) continue;

      const exchange = cols[iExch]?.replace('_EQ', '').replace('_FO', '');
      if (!exchange || (exchange !== 'NSE' && exchange !== 'BSE')) continue;

      const symbolName = (cols[iName] || cols[iSymbol] || '').replace(/-EQ$/i, '');
      if (!symbolName) continue;

      rows.push({
        token: cols[iKey] || '',           // Upstox instrument_key as the token
        exchange,
        symbol: symbolName,
        trading_symbol: cols[iSymbol] || '',
        instrument_type: cols[iType] || 'EQ',
        lot_size: parseInt(cols[iLot] || '1', 10),
        tick_size: parseFloat(cols[iTick] || '0.05'),
        expiry: cols[iExpiry] || null,
        strike: cols[iStrike] ? parseFloat(cols[iStrike]) : null,
        updated_at: new Date(),
      });
    }

    const updated = await this.repo.upsertBatch(rows);
    logger.info(`[Instruments] Synced ${updated} instruments from ${lines.length - 1} lines`);
    return { total: lines.length - 1, updated };
  }

  /**
   * Resolve a symbol name + exchange to its Upstox instrument key.
   * Returns the full SymbolInfo including `instrumentKey` for API calls.
   */
  async resolveInstrument(symbol: string, exchange: string, instrumentType = 'EQ'): Promise<SymbolInfo | null> {
    const cacheKey = `${CACHE_PREFIX}${exchange}:${symbol}:${instrumentType}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const row = await this.repo.findBySymbol(symbol, exchange, instrumentType);
    if (!row) return null;

    const info = this.mapToSymbolInfo(row);
    await this.redis.set(cacheKey, JSON.stringify(info), 'EX', CACHE_TTL);
    return info;
  }

  async searchSymbols(query: string, exchange?: string, limit = 10): Promise<SymbolInfo[]> {
    if (!query || query.length < 1) return [];
    const rows = await this.repo.search(query.toUpperCase(), exchange, limit);
    return rows.map((r) => this.mapToSymbolInfo(r));
  }

  async isStale(): Promise<boolean> {
    const lastUpdate = await this.repo.getLastUpdate();
    if (!lastUpdate) return true;
    const hoursSince = (Date.now() - new Date(lastUpdate).getTime()) / 3_600_000;
    return hoursSince > 24;
  }

  private mapToSymbolInfo(row: SymbolRow): SymbolInfo {
    return {
      symbol: row.symbol,
      exchange: row.exchange,
      instrumentKey: row.token,     // Upstox instrument_key stored in the token column
      tradingSymbol: row.trading_symbol,
      instrumentType: row.instrument_type,
      lotSize: row.lot_size,
      tickSize: row.tick_size,
      isin: '',
      expiry: row.expiry || undefined,
      strike: row.strike || undefined,
    };
  }
}
