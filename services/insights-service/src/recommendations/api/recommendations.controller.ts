import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ScorerService } from '../scoring/scorer.service';
import { ScoreRepository } from '../data/score.repository';
import { ModelRegistryRepository } from '../../shared/model-registry.repository';

const ScoreBody = z.object({
  exchange: z.string().min(2).max(10),
  symbol: z.string().min(1).max(20),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  model_name: z.enum(['technical', 'fundamental', 'sentiment', 'meta']).optional(),
});

let scorer: ScorerService;
let scores: ScoreRepository;
let registry: ModelRegistryRepository;

export function initRecommendationController(s: ScorerService, sr: ScoreRepository, rr: ModelRegistryRepository): void {
  scorer = s;
  scores = sr;
  registry = rr;
}

export class RecommendationController {
  static async getTop(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const date = String(req.query.date || '');
      const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 100);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.status(400).json({ success: false, error: { code: 'INVALID_DATE', message: 'date=YYYY-MM-DD required' } });
        return;
      }
      const meta = await registry.getActive('meta');
      if (!meta) {
        res.status(503).json({ success: false, error: { code: 'NO_META_MODEL', message: 'no active meta model in registry' } });
        return;
      }
      const rows = await scores.topRanked(date, meta.id, limit);
      res.json({ success: true, data: rows });
    } catch (error) { next(error); }
  }

  static async scoreSymbol(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = ScoreBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: { code: 'INVALID_BODY', message: parsed.error.message } });
        return;
      }
      const { exchange, symbol, date } = parsed.data;
      const name = parsed.data.model_name ?? 'technical';
      const result = await scorer.scoreSymbol(name, exchange, symbol, date);
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  static async rankUniverse(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const exchange = String(req.body?.exchange || 'NSE');
      const date = String(req.body?.date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.status(400).json({ success: false, error: { code: 'INVALID_DATE', message: 'date=YYYY-MM-DD required' } });
        return;
      }
      const topN = Math.min(parseInt(String(req.body?.top_n || '50'), 10) || 50, 500);
      const results = await scorer.scoreUniverseMeta(exchange, date, topN);
      res.json({ success: true, data: results });
    } catch (error) { next(error); }
  }
}
