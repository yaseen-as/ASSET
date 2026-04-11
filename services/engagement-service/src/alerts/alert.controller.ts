import { Request, Response, NextFunction } from 'express';
import { AlertService } from './alert.service';

const alertService = new AlertService();

export class AlertController {
  static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

      const { symbol, exchange, condition_type, threshold, label, note, expires_at } = req.body;
      if (!symbol || !condition_type || threshold === undefined) {
        res.status(400).json({ error: 'symbol, condition_type and threshold are required' });
        return;
      }

      const alert = await alertService.createAlert(userId, {
        symbol, exchange, condition_type, threshold: parseFloat(threshold), label, note, expires_at,
      });
      res.status(201).json({ data: alert });
    } catch (err) { next(err); }
  }

  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

      const alerts = await alertService.getUserAlerts(userId, req.query.status as string | undefined);
      res.json({ data: alerts });
    } catch (err) { next(err); }
  }

  static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

      const alert = await alertService.getAlertById(req.params.id, userId);
      if (!alert) { res.status(404).json({ error: 'Alert not found' }); return; }
      res.json({ data: alert });
    } catch (err) { next(err); }
  }

  static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

      const alert = await alertService.updateAlert(req.params.id, userId, req.body);
      if (!alert) { res.status(404).json({ error: 'Alert not found' }); return; }
      res.json({ data: alert });
    } catch (err) { next(err); }
  }

  static async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

      const deleted = await alertService.deleteAlert(req.params.id, userId);
      if (!deleted) { res.status(404).json({ error: 'Alert not found' }); return; }
      res.status(204).send();
    } catch (err) { next(err); }
  }

  static async reactivate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

      const alert = await alertService.reactivateAlert(req.params.id, userId);
      if (!alert) { res.status(404).json({ error: 'Cannot reactivate this alert' }); return; }
      res.json({ data: alert });
    } catch (err) { next(err); }
  }
}
