import { Request, Response, NextFunction } from 'express';
import { SignalRepository } from '../repositories/signal.repository';
import type { RecommendationQuery } from '@platform/shared';

const signalRepo = new SignalRepository();

export class RecommendationController {
  static async getRecommendations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query: RecommendationQuery = {
        source: (req.query.source as string) || 'all',
        minConfidence: req.query.minConfidence ? parseInt(req.query.minConfidence as string) : undefined,
        symbol: req.query.symbol as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      };
      const signals = await signalRepo.getSignals(query);
      res.json({ success: true, data: signals });
    } catch (error) { next(error); }
  }

  static async getPersonalized(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const recs = await signalRepo.getUserRecommendations(userId);
      res.json({ success: true, data: recs });
    } catch (error) { next(error); }
  }
}
