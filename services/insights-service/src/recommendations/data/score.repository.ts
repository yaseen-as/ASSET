import { db } from '../../config/database';
import type { ModelMeta, ModelName } from '../../shared/types';

interface ScoreInput {
  symbol: string;
  exchange: string;
  as_of_date: string;
  model_id: string;
  score: number;
  features_ref: Record<string, unknown>;
}

interface FinalScoreInput {
  symbol: string;
  exchange: string;
  as_of_date: string;
  meta_model_id: string;
  technical_score: number | null;
  fundamental_score: number | null;
  sentiment_score: number | null;
  final_score: number;
}

export class ScoreRepository {
  async upsertScore(model: ModelMeta, input: ScoreInput): Promise<void> {
    if (model.name === 'meta') throw new Error('Use upsertFinalScore for meta models');
    const table = this.tableFor(model.name);
    await db(table)
      .insert({
        symbol: input.symbol,
        exchange: input.exchange,
        as_of_date: input.as_of_date,
        model_id: input.model_id,
        score: input.score,
        features_ref: JSON.stringify(input.features_ref),
      })
      .onConflict(['symbol', 'exchange', 'as_of_date', 'model_id'])
      .merge(['score', 'features_ref']);
  }

  async upsertFinalScore(input: FinalScoreInput): Promise<void> {
    await db('recommendations.final_scores')
      .insert(input)
      .onConflict(['symbol', 'exchange', 'as_of_date', 'meta_model_id'])
      .merge(['technical_score', 'fundamental_score', 'sentiment_score', 'final_score']);
  }

  async assignDailyRanks(date: string, metaModelId: string): Promise<void> {
    await db.raw(
      `
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY final_score DESC) AS r
        FROM recommendations.final_scores
        WHERE as_of_date = ? AND meta_model_id = ?
      )
      UPDATE recommendations.final_scores f
      SET rank = ranked.r
      FROM ranked
      WHERE f.id = ranked.id
      `,
      [date, metaModelId],
    );
  }

  async topRanked(date: string, metaModelId: string, limit: number) {
    return db('recommendations.final_scores')
      .where({ as_of_date: date, meta_model_id: metaModelId })
      .orderBy('rank', 'asc')
      .limit(limit);
  }

  private tableFor(name: ModelName): string {
    return `recommendations.${name}_scores`;
  }
}
