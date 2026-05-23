import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ModelRegistryRepository } from '../../shared/model-registry.repository';
import { OnnxLoaderService } from '../inference/onnx-loader.service';
import type { ModelName, ModelStatus } from '../../shared/types';

const PromoteBody = z.object({
  status: z.enum(['draft', 'canary', 'production', 'retired']),
  rollout_percent: z.number().int().min(0).max(100),
});

let registry: ModelRegistryRepository;
let loader: OnnxLoaderService;

export function initModelsController(r: ModelRegistryRepository, l: OnnxLoaderService): void {
  registry = r;
  loader = l;
}

export class ModelsController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const name = req.query.name as ModelName | undefined;
      const items = await registry.list(name);
      res.json({ success: true, data: items });
    } catch (error) { next(error); }
  }

  static async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const m = await registry.getById(id);
      if (!m) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'model not found' } });
        return;
      }
      res.json({ success: true, data: m });
    } catch (error) { next(error); }
  }

  static async promote(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = PromoteBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: { code: 'INVALID_BODY', message: parsed.error.message } });
        return;
      }
      const id = String(req.params.id);
      await registry.updateStatus(id, parsed.data.status as ModelStatus, parsed.data.rollout_percent);
      // Force a reload so subsequent inference picks up the new artifact bytes
      // if the same model_id was already cached with stale metadata.
      loader.evict(id);
      const updated = await registry.getById(id);
      res.json({ success: true, data: updated });
    } catch (error) { next(error); }
  }
}
