import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { BacktestRepository } from '../data/backtest.repository';
import { ModelRegistryRepository } from '../../shared/model-registry.repository';
import { enqueueBacktest } from '../queue/backtest.queue';

const ParamsSchema = z.object({
  top_n: z.number().int().positive().max(200),
  position_size_fraction: z.number().positive().max(1),
  stop_loss: z.number().lt(0).gt(-1),
  take_profit: z.number().gt(0).lt(5),
  max_holding_days: z.number().int().positive().max(252),
  initial_capital: z.number().positive(),
  cost_bps: z.number().min(0).max(500),
  exchange: z.string().min(2).max(10),
});

const BodySchema = z.object({
  model_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  params: ParamsSchema,
});

let repo: BacktestRepository;
let registry: ModelRegistryRepository;

export function initBacktestController(r: BacktestRepository, reg: ModelRegistryRepository): void {
  repo = r;
  registry = reg;
}

export class BacktestController {
  static async createRun(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = BodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: { code: 'INVALID_BODY', message: parsed.error.message } });
        return;
      }
      const body = parsed.data;
      const model = await registry.getById(body.model_id);
      if (!model) {
        res.status(404).json({ success: false, error: { code: 'MODEL_NOT_FOUND', message: `model ${body.model_id} not in registry` } });
        return;
      }
      const id = await repo.insertQueued(body);
      await enqueueBacktest({ backtest_id: id, request: body });
      res.status(202).json({ success: true, data: { id, status: 'queued' } });
    } catch (error) { next(error); }
  }

  static async getRun(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = String(req.params.id);
      const record = await repo.getById(id);
      if (!record) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `backtest ${id} not found` } });
        return;
      }
      res.json({ success: true, data: record });
    } catch (error) { next(error); }
  }

  static async listResults(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const modelId = String(req.query.model_id || '');
      if (!modelId) {
        res.status(400).json({ success: false, error: { code: 'MISSING_MODEL_ID', message: 'model_id query param required' } });
        return;
      }
      const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 100);
      const records = await repo.listByModel(modelId, limit);
      res.json({ success: true, data: records });
    } catch (error) { next(error); }
  }
}
