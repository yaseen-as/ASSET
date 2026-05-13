import { db } from '../config/database';
import { toIsoDate } from '../utils/trading-days';

interface Bar {
  symbol: string;
  date: string;
  close: number;
  high: number;
  low: number;
}

// Loads the full OHLCV slice for the universe + date range into memory.
// For 500 symbols * 250 days = 125k rows it's trivial; revisit if universe scales.
export class PriceRepository {
  private byKey: Map<string, Bar> = new Map();

  async load(exchange: string, start: string, end: string, symbols?: string[]): Promise<void> {
    const q = db('market.ohlcv_daily')
      .select('symbol', 'date', 'close', 'high', 'low')
      .where('exchange', exchange)
      .whereBetween('date', [start, end]);
    if (symbols && symbols.length) q.whereIn('symbol', symbols);
    const rows = await q;
    for (const r of rows as any[]) {
      const date = toIsoDate(r.date);
      this.byKey.set(`${r.symbol}|${date}`, {
        symbol: r.symbol,
        date,
        close: Number(r.close),
        high: Number(r.high),
        low: Number(r.low),
      });
    }
  }

  get(symbol: string, date: string): Bar | undefined {
    return this.byKey.get(`${symbol}|${date}`);
  }
}
