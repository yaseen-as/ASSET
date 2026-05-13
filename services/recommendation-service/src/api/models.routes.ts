import { Router } from 'express';
import type { RegistryRepository } from '../data/registry.repository';
import type { OnnxLoaderService } from '../inference/onnx-loader.service';
import { makeModelsController } from './models.controller';

export function makeModelsRoutes(registry: RegistryRepository, loader: OnnxLoaderService): Router {
  const router = Router();
  const c = makeModelsController(registry, loader);
  router.get('/', c.list);
  router.get('/:id', c.get);
  router.post('/:id/promote', c.promote);
  return router;
}
