import { Request, Response, NextFunction } from 'express';
import { FeatureStoreRepository } from './repository';
import type { MaterializationCron } from './materialization/materialization.cron';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

let repo: FeatureStoreRepository;
let cron: MaterializationCron;

export function initFeatureController(r: FeatureStoreRepository, c: MaterializationCron): void {
  repo = r;
  cron = c;
}

export class FeatureController {
  static async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const exchange = String(req.params.exchange);
      const symbol = String(req.params.symbol);
      const date = String(req.query.date || '');
      const set = String(req.query.set || 'technical_v1');
      if (!ISO_DATE.test(date)) {
        res.status(400).json({ success: false, error: { code: 'INVALID_DATE', message: 'date=YYYY-MM-DD required' } });
        return;
      }
      const v = await repo.getOne(exchange, symbol, date, set);
      if (!v) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `no features for ${exchange}:${symbol} on ${date}` } });
        return;
      }
      res.json({ success: true, data: v });
    } catch (error) { next(error); }
  }

  static async getBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const exchange = String(req.query.exchange || 'NSE');
      const date = String(req.query.date || '');
      const set = String(req.query.set || 'technical_v1');
      const symbolsCsv = req.query.symbols ? String(req.query.symbols) : '';
      const symbols = symbolsCsv ? symbolsCsv.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
      if (!ISO_DATE.test(date)) {
        res.status(400).json({ success: false, error: { code: 'INVALID_DATE', message: 'date=YYYY-MM-DD required' } });
        return;
      }
      const vecs = await repo.getBatch(exchange, date, set, symbols);
      res.json({ success: true, data: vecs });
    } catch (error) { next(error); }
  }

  static async materialize(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const date = req.body?.date as string | undefined;
      if (date && !ISO_DATE.test(date)) {
        res.status(400).json({ success: false, error: { code: 'INVALID_DATE', message: 'date=YYYY-MM-DD required' } });
        return;
      }
      const out = await cron.runOnce(date);
      res.status(202).json({ success: true, data: out });
    } catch (error) { next(error); }
  }
}
