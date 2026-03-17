import { db } from '../config/database';

export interface SymbolRow {
  token: string;
  exchange: string;
  symbol: string;
  trading_symbol: string;
  instrument_type: string;
  lot_size: number;
  tick_size: number;
  expiry: string | null;
  strike: number | null;
  updated_at: Date;
}

export class SymbolMasterRepository {
  private table = 'broker.symbol_master';

  async upsertBatch(rows: Partial<SymbolRow>[]): Promise<number> {
    if (rows.length === 0) return 0;

    // Batch insert in chunks of 500
    let total = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      await db(this.table)
        .insert(chunk)
        .onConflict(['token', 'exchange'])
        .merge(['symbol', 'trading_symbol', 'instrument_type', 'lot_size', 'tick_size', 'expiry', 'strike', 'updated_at']);
      total += chunk.length;
    }
    return total;
  }

  async findBySymbol(symbol: string, exchange: string, instrumentType = 'EQ'): Promise<SymbolRow | undefined> {
    return db(this.table)
      .where({ symbol, exchange, instrument_type: instrumentType })
      .first();
  }

  async findByToken(token: string, exchange: string): Promise<SymbolRow | undefined> {
    return db(this.table).where({ token, exchange }).first();
  }

  async search(query: string, exchange?: string, limit = 10): Promise<SymbolRow[]> {
    let q = db(this.table)
      .where('symbol', 'ilike', `${query}%`)
      .orWhere('trading_symbol', 'ilike', `${query}%`);

    if (exchange) {
      q = q.andWhere('exchange', exchange);
    }

    return q.orderByRaw("CASE WHEN instrument_type = 'EQ' THEN 0 ELSE 1 END")
      .orderBy('symbol')
      .limit(limit);
  }

  async count(): Promise<number> {
    const [{ count }] = await db(this.table).count('* as count');
    return Number(count);
  }

  async getLastUpdate(): Promise<Date | null> {
    const row = await db(this.table).max('updated_at as max_date').first();
    return row?.max_date || null;
  }
}
