import { Request, Response, NextFunction } from 'express';
import { SignalRepository } from './signal.repository';
import { SignalGeneratorService } from './signal-generator.service';
import { config } from '../config';
import type { RecommendationQuery } from '@platform/shared';

const signalRepo = new SignalRepository();
let signalGenerator: SignalGeneratorService;

export function initRecommendationController(generator: SignalGeneratorService): void {
  signalGenerator = generator;
}

export class RecommendationController {
  static async getRecommendations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query: RecommendationQuery = {
        source: (req.query.source as string) || 'all',
        minConfidence: req.query.minConfidence ? parseInt(req.query.minConfidence as string) : undefined,
        symbol: req.query.symbol as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      };

      // Generate on-demand if no recent signals exist
      const cacheThresholdMs = config.signalCacheHours * 60 * 60 * 1000;
      const latestSignal = await signalRepo.getLatestSignalTime();
      if (!latestSignal || Date.now() - new Date(latestSignal).getTime() > cacheThresholdMs) {
        if (signalGenerator) {
          await signalGenerator.generateAll().catch(() => {});
        }
      }

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
