import { db } from '../config/database';

export interface SectorRow {
  symbol: string;
  exchange: string;
  sector: string;
  industry: string | null;
  market_cap: string | null;
}

export class SectorRepository {
  async findBySymbol(symbol: string, exchange: string): Promise<SectorRow | null> {
    return db('portfolio.sector_master')
      .where({ symbol, exchange })
      .first() || null;
  }

  async findBySymbols(symbols: { symbol: string; exchange: string }[]): Promise<SectorRow[]> {
    if (symbols.length === 0) return [];
    const query = db('portfolio.sector_master');
    for (const s of symbols) {
      query.orWhere({ symbol: s.symbol, exchange: s.exchange });
    }
    return query;
  }

  async findAll(): Promise<SectorRow[]> {
    return db('portfolio.sector_master').orderBy('sector');
  }

  async upsert(row: SectorRow): Promise<void> {
    await db.raw(`
      INSERT INTO portfolio.sector_master (symbol, exchange, sector, industry, market_cap)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (symbol, exchange) DO UPDATE SET
        sector = EXCLUDED.sector,
        industry = EXCLUDED.industry,
        market_cap = EXCLUDED.market_cap,
        updated_at = NOW()
    `, [row.symbol, row.exchange, row.sector, row.industry, row.market_cap]);
  }
}
