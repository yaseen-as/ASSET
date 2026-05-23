import { createLogger } from '@platform/shared';
import type { ScoreResult } from '../types';
import type { ModelName } from '../../shared/types';
import type { FeatureVector } from '../../features/types';
import { InferenceService } from '../inference/inference.service';
import { ModelRegistryRepository } from '../../shared/model-registry.repository';
import { ScoreRepository } from '../data/score.repository';
import { FeatureStoreRepository } from '../../features/repository';

const logger = createLogger('Scorer');

// One scorer handles all model types; the model name picks which feature_set
// to read from the in-process feature store and which score table to write into.
export class ScorerService {
  constructor(
    private readonly registry: ModelRegistryRepository,
    private readonly inference: InferenceService,
    private readonly scores: ScoreRepository,
    private readonly features: FeatureStoreRepository,
  ) {}

  async scoreSymbol(name: ModelName, exchange: string, symbol: string, date: string): Promise<ScoreResult> {
    const model = await this.registry.getActive(name);
    if (!model) throw new Error(`No active ${name} model in registry`);
    const feat = await this.features.getOne(exchange, symbol, date, model.feature_set);
    if (!feat) throw new Error(`No features for ${exchange}:${symbol} on ${date} (set=${model.feature_set})`);
    const score = await this.inference.scoreOne(model, feat);
    if (name !== 'meta') {
      await this.scores.upsertScore(model, {
        symbol, exchange, as_of_date: date, model_id: model.id, score,
        features_ref: feat.features,
      });
    }
    return { symbol, exchange, score, model_id: model.id };
  }

  async scoreUniverse(name: ModelName, exchange: string, date: string): Promise<ScoreResult[]> {
    const model = await this.registry.getActive(name);
    if (!model) throw new Error(`No active ${name} model in registry`);
    const featVecs = await this.features.getBatch(exchange, date, model.feature_set);
    if (featVecs.length === 0) {
      logger.warn(`No features for ${exchange} on ${date} (set=${model.feature_set})`);
      return [];
    }
    const scores = await this.inference.scoreBatch(model, featVecs);
    const results: ScoreResult[] = [];
    for (let i = 0; i < featVecs.length; i++) {
      const f = featVecs[i];
      const s = scores[i];
      results.push({ symbol: f.symbol, exchange: f.exchange, score: s, model_id: model.id });
      if (name !== 'meta') {
        await this.scores.upsertScore(model, {
          symbol: f.symbol, exchange: f.exchange, as_of_date: date, model_id: model.id,
          score: s, features_ref: f.features,
        });
      }
    }
    return results;
  }

  // Meta combines per-component scores from technical/fundamental/sentiment
  // *_scores tables on the same date. Falls back to "technical only" when
  // no meta model is registered (e.g. P1 → P3 transition window).
  async scoreUniverseMeta(exchange: string, date: string, topN = 50): Promise<ScoreResult[]> {
    const meta = await this.registry.getActive('meta');
    if (!meta) {
      logger.warn('No meta model registered; falling back to technical-only ranking');
      return this.scoreUniverse('technical', exchange, date);
    }
    const components = await this.loadComponents(exchange, date);
    const vectors: FeatureVector[] = components.map((c) => ({
      symbol: c.symbol,
      exchange: c.exchange,
      as_of_date: date,
      feature_set: 'meta_v1',
      features: {
        technical_score: c.technical_score ?? 0,
        fundamental_score: c.fundamental_score ?? 0,
        sentiment_score: c.sentiment_score ?? 0,
      },
    }));
    const finals = await this.inference.scoreBatch(meta, vectors);
    const results: ScoreResult[] = [];
    for (let i = 0; i < vectors.length; i++) {
      const v = vectors[i];
      const final = finals[i];
      results.push({ symbol: v.symbol, exchange: v.exchange, score: final, model_id: meta.id });
      await this.scores.upsertFinalScore({
        symbol: v.symbol, exchange: v.exchange, as_of_date: date, meta_model_id: meta.id,
        technical_score: components[i].technical_score,
        fundamental_score: components[i].fundamental_score,
        sentiment_score: components[i].sentiment_score,
        final_score: final,
      });
    }
    await this.scores.assignDailyRanks(date, meta.id);
    return results.sort((a, b) => b.score - a.score).slice(0, topN);
  }

  private async loadComponents(exchange: string, date: string) {
    const { db } = await import('../../config/database');
    const rows = await db.raw(
      `
      WITH t AS (SELECT symbol, exchange, AVG(score) AS s FROM recommendations.technical_scores
                 WHERE as_of_date = ? AND exchange = ? GROUP BY symbol, exchange),
           f AS (SELECT symbol, exchange, AVG(score) AS s FROM recommendations.fundamental_scores
                 WHERE as_of_date = ? AND exchange = ? GROUP BY symbol, exchange),
           sen AS (SELECT symbol, exchange, AVG(score) AS s FROM recommendations.sentiment_scores
                   WHERE as_of_date = ? AND exchange = ? GROUP BY symbol, exchange)
      SELECT
        COALESCE(t.symbol, f.symbol, sen.symbol) AS symbol,
        COALESCE(t.exchange, f.exchange, sen.exchange) AS exchange,
        t.s AS technical_score,
        f.s AS fundamental_score,
        sen.s AS sentiment_score
      FROM t
      FULL OUTER JOIN f USING (symbol, exchange)
      FULL OUTER JOIN sen USING (symbol, exchange)
      `,
      [date, exchange, date, exchange, date, exchange],
    );
    return (rows.rows as Array<{ symbol: string; exchange: string; technical_score: string | null; fundamental_score: string | null; sentiment_score: string | null }>).map((r) => ({
      symbol: r.symbol,
      exchange: r.exchange,
      technical_score: r.technical_score === null ? null : Number(r.technical_score),
      fundamental_score: r.fundamental_score === null ? null : Number(r.fundamental_score),
      sentiment_score: r.sentiment_score === null ? null : Number(r.sentiment_score),
    }));
  }
}
