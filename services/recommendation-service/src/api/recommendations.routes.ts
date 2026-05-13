import { Router } from 'express';
import type { ScorerService } from '../scoring/scorer.service';
import type { ScoreRepository } from '../data/score.repository';
import type { RegistryRepository } from '../data/registry.repository';
import { makeRecommendationController } from './recommendations.controller';

export function makeRecommendationRoutes(scorer: ScorerService, scores: ScoreRepository, registry: RegistryRepository): Router {
  const router = Router();
  const c = makeRecommendationController(scorer, scores, registry);
  router.get('/top', c.getTop);
  router.post('/score', c.scoreSymbol);
  router.post('/rank', c.rankUniverse);
  return router;
}
