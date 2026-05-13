import { Request, Response } from 'express';
import { z } from 'zod';
import { RegistryRepository } from '../data/registry.repository';
import { OnnxLoaderService } from '../inference/onnx-loader.service';
import type { ModelName, ModelStatus } from '../types';

const PromoteBody = z.object({
  status: z.enum(['draft', 'canary', 'production', 'retired']),
  rollout_percent: z.number().int().min(0).max(100),
});

export function makeModelsController(registry: RegistryRepository, loader: OnnxLoaderService) {
  async function list(req: Request, res: Response): Promise<void> {
    const name = req.query.name as ModelName | undefined;
    const items = await registry.list(name);
    res.json({ success: true, data: items });
  }

  async function get(req: Request, res: Response): Promise<void> {
    const m = await registry.getById(req.params.id);
    if (!m) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'model not found' } });
      return;
    }
    res.json({ success: true, data: m });
  }

  async function promote(req: Request, res: Response): Promise<void> {
    const parsed = PromoteBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: { code: 'INVALID_BODY', message: parsed.error.message } });
      return;
    }
    await registry.updateStatus(req.params.id, parsed.data.status as ModelStatus, parsed.data.rollout_percent);
    // Force a reload so subsequent inference picks up the new artifact bytes
    // if the same model_id was already cached with stale metadata.
    loader.evict(req.params.id);
    const updated = await registry.getById(req.params.id);
    res.json({ success: true, data: updated });
  }

  return { list, get, promote };
}
