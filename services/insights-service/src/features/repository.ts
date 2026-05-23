import { db } from '../config/database';
import type { FeatureVector } from './types';

interface Row {
  symbol: string;
  exchange: string;
  as_of_date: Date;
  feature_set: string;
  features: Record<string, number>;
}

export class FeatureStoreRepository {
  async getOne(exchange: string, symbol: string, date: string, featureSet: string): Promise<FeatureVector | null> {
    const r = (await db('recommendations.feature_store')
      .where({ exchange, symbol, as_of_date: date, feature_set: featureSet })
      .first()) as Row | undefined;
    return r ? this.toVector(r) : null;
  }

  async getBatch(exchange: string, date: string, featureSet: string, symbols?: string[]): Promise<FeatureVector[]> {
    const q = db('recommendations.feature_store')
      .where({ exchange, as_of_date: date, feature_set: featureSet });
    if (symbols && symbols.length) q.whereIn('symbol', symbols);
    const rows = (await q) as Row[];
    return rows.map((r) => this.toVector(r));
  }

  async upsertBatch(vectors: FeatureVector[]): Promise<number> {
    if (vectors.length === 0) return 0;
    const rows = vectors.map((v) => ({
      symbol: v.symbol,
      exchange: v.exchange,
      as_of_date: v.as_of_date,
      feature_set: v.feature_set,
      features: JSON.stringify(v.features),
    }));
    // Partition by month must exist before insert; the default partition catches gaps.
    await db('recommendations.feature_store')
      .insert(rows)
      .onConflict(['symbol', 'exchange', 'as_of_date', 'feature_set'])
      .merge(['features', 'computed_at']);
    return rows.length;
  }

  private toVector(r: Row): FeatureVector {
    return {
      symbol: r.symbol,
      exchange: r.exchange,
      as_of_date: r.as_of_date.toISOString().slice(0, 10),
      feature_set: r.feature_set,
      features: r.features,
    };
  }
}
