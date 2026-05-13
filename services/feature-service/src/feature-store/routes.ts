import { Router } from 'express';
import type { FeatureStoreRepository } from './repository';
import type { MaterializationCron } from '../materialization/materialization.cron';
import { makeFeatureController } from './controller';

export function makeFeatureRoutes(repo: FeatureStoreRepository, cron: MaterializationCron): Router {
  const router = Router();
  const c = makeFeatureController(repo, cron);
  router.get('/batch', c.getBatch);
  router.get('/:exchange/:symbol', c.getOne);
  router.post('/materialize', c.materialize);
  return router;
}
