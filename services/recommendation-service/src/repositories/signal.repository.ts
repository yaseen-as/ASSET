import { db } from '../config/database';
import type { Signal, SignalSource, Exchange } from '@platform/shared';

export class SignalRepository {
  private table = 'recommendations.signals';
  private userRecsTable = 'recommendations.user_recommendations';

  async createSignal(data: {
    symbol: string;
    exchange: string;
    signal_type: string;
    source: string;
    confidence: number;
    reasoning: string;
    metadata?: Record<string, unknown>;
    valid_until?: Date;
  }) {
    const [row] = await db(this.table).insert(data).returning('*');
    return row;
  }

  async getSignals(filters: {
    source?: string;
    minConfidence?: number;
    symbol?: string;
    exchange?: string;
    limit?: number;
  }): Promise<Signal[]> {
    let query = db(this.table)
      .orderBy('created_at', 'desc')
      .limit(filters.limit || 50);

    if (filters.source && filters.source !== 'all') {
      query = query.where({ source: filters.source });
    }
    if (filters.minConfidence) {
      query = query.where('confidence', '>=', filters.minConfidence);
    }
    if (filters.symbol) {
      query = query.where({ symbol: filters.symbol });
    }
    if (filters.exchange) {
      query = query.where({ exchange: filters.exchange });
    }

    const rows = await query;
    return rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      symbol: r.symbol as string,
      exchange: r.exchange as Exchange,
      signalType: r.signal_type as Signal['signalType'],
      source: r.source as SignalSource,
      confidence: r.confidence as number,
      reasoning: r.reasoning as string,
      metadata: r.metadata as Record<string, unknown>,
      validUntil: r.valid_until as Date,
      createdAt: r.created_at as Date,
    }));
  }

  async getUserRecommendations(userId: string, limit: number = 20): Promise<unknown[]> {
    return db(this.userRecsTable)
      .join(`${this.table}`, `${this.userRecsTable}.signal_id`, `${this.table}.id`)
      .where({ [`${this.userRecsTable}.user_id`]: userId })
      .orderBy(`${this.userRecsTable}.created_at`, 'desc')
      .limit(limit)
      .select(`${this.table}.*`, `${this.userRecsTable}.personalization_score`, `${this.userRecsTable}.is_viewed`);
  }

  async createUserRecommendation(userId: string, signalId: string, personalizationScore: number = 50) {
    const [row] = await db(this.userRecsTable)
      .insert({ user_id: userId, signal_id: signalId, personalization_score: personalizationScore })
      .returning('*');
    return row;
  }
}
