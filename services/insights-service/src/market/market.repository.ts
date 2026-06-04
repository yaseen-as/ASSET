import { db } from '../config/database';
import type { OHLCV, Exchange } from '@platform/shared';

export class MarketDataRepository {
  private table = 'insights.ohlcv_daily';

  async getHistorical(symbol: string, exchange: Exchange, from: string, to: string): Promise<OHLCV[]> {
    const rows = await db(this.table)
      .where({ symbol, exchange })
      .whereBetween('date', [from, to])
      .orderBy('date', 'asc');

    return rows.map((r: Record<string, unknown>) => ({
      date: (r.date as Date).toISOString().split('T')[0],
      open: parseFloat(r.open as string),
      high: parseFloat(r.high as string),
      low: parseFloat(r.low as string),
      close: parseFloat(r.close as string),
      volume: parseInt(r.volume as string, 10),
    }));
  }

  async upsertDaily(symbol: string, exchange: Exchange, candles: OHLCV[]): Promise<void> {
    for (const candle of candles) {
      await db(this.table)
        .insert({
          symbol,
          exchange,
          date: candle.date,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        })
        .onConflict(['symbol', 'exchange', 'date'])
        .merge();
    }
  }

  async getLatestCandles(symbol: string, exchange: Exchange, count: number = 200): Promise<OHLCV[]> {
    const rows = await db(this.table)
      .where({ symbol, exchange })
      .orderBy('date', 'desc')
      .limit(count);

    return rows
      .reverse()
      .map((r: Record<string, unknown>) => ({
        date: (r.date as Date).toISOString().split('T')[0],
        open: parseFloat(r.open as string),
        high: parseFloat(r.high as string),
        low: parseFloat(r.low as string),
        close: parseFloat(r.close as string),
        volume: parseInt(r.volume as string, 10),
      }));
  }
}
