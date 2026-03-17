import axios from 'axios';
import Redis from 'ioredis';
import { SymbolMasterRepository, type SymbolRow } from '../repositories/symbol-master.repository';
import { config } from '../config';

export interface SymbolInfo {
  symbol: string;
  exchange: string;
  token: string;
  tradingSymbol: string;
  instrumentType: string;
  lotSize: number;
  tickSize: number;
  expiry?: string;
  strike?: number;
}

const CACHE_PREFIX = 'symbol:';
const CACHE_TTL = 86400; // 24h

export class SymbolMasterService {
  private repo = new SymbolMasterRepository();
  private redis: Redis;

  constructor() {
    this.redis = new Redis(config.redis.url);
  }

  /**
   * Download Angel One ScripMaster JSON and upsert into DB.
   * The JSON is an array of objects with fields like:
   * { token, symbol, name, expiry, strike, lotsize, instrumenttype, exch_seg, tick_size }
   */
  async fetchAndSync(): Promise<{ total: number; updated: number }> {
    const url = config.angelOne.scripMasterUrl;
    console.log(`[SymbolMaster] Fetching instrument master from ${url}...`);

    const { data } = await axios.get(url, { timeout: 120_000 });
    const instruments = Array.isArray(data) ? data : [];

    // Filter to NSE/BSE equity + top F&O
    const rows: Partial<SymbolRow>[] = [];
    for (const inst of instruments) {
      const exchange = inst.exch_seg;
      if (!exchange || (exchange !== 'NSE' && exchange !== 'BSE' && exchange !== 'NFO' && exchange !== 'BFO')) {
        continue;
      }

      rows.push({
        token: String(inst.token),
        exchange: exchange === 'NFO' ? 'NSE' : exchange === 'BFO' ? 'BSE' : exchange,
        symbol: inst.symbol?.replace(/-EQ$/i, '') || inst.name || '',
        trading_symbol: inst.symbol || '',
        instrument_type: inst.instrumenttype || 'EQ',
        lot_size: parseInt(inst.lotsize || '1', 10),
        tick_size: parseFloat(inst.tick_size || '0.05'),
        expiry: inst.expiry || null,
        strike: inst.strike ? parseFloat(inst.strike) : null,
        updated_at: new Date(),
      });
    }

    const updated = await this.repo.upsertBatch(rows);
    console.log(`[SymbolMaster] Synced ${updated} instruments (${rows.length} filtered from ${instruments.length} total)`);
    return { total: instruments.length, updated };
  }

  /**
   * Resolve a symbol to its Angel One token info.
   * Checks Redis cache first, falls back to DB.
   */
  async resolveToken(symbol: string, exchange: string, instrumentType = 'EQ'): Promise<SymbolInfo | null> {
    const cacheKey = `${CACHE_PREFIX}${exchange}:${symbol}:${instrumentType}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const row = await this.repo.findBySymbol(symbol, exchange, instrumentType);
    if (!row) return null;

    const info = this.mapToSymbolInfo(row);
    await this.redis.set(cacheKey, JSON.stringify(info), 'EX', CACHE_TTL);
    return info;
  }

  /**
   * Search symbols by prefix (for autocomplete).
   */
  async searchSymbols(query: string, exchange?: string, limit = 10): Promise<SymbolInfo[]> {
    if (!query || query.length < 1) return [];
    const rows = await this.repo.search(query.toUpperCase(), exchange, limit);
    return rows.map((r) => this.mapToSymbolInfo(r));
  }

  /**
   * Check if master data is stale (>24h) and needs refresh.
   */
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
      token: row.token,
      tradingSymbol: row.trading_symbol,
      instrumentType: row.instrument_type,
      lotSize: row.lot_size,
      tickSize: row.tick_size,
      expiry: row.expiry || undefined,
      strike: row.strike || undefined,
    };
  }
}
