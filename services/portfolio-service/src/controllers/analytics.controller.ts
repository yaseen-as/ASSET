import type { Request, Response } from 'express';
import { AnalyticsService } from '../services/analytics.service';

const analyticsService = new AnalyticsService();

export class AnalyticsController {
  static async getSummary(req: Request, res: Response) {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

      const summary = await analyticsService.getAnalyticsSummary(userId);
      res.json({ success: true, data: summary });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async getPnlHistory(req: Request, res: Response) {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

      const period = (req.query.period as string) || '30d';
      const history = await analyticsService.getPnlHistory(userId, period);
      res.json({ success: true, data: history });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async getAllocation(req: Request, res: Response) {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

      const allocation = await analyticsService.getSectorAllocation(userId);
      res.json({ success: true, data: allocation });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async getTopMovers(req: Request, res: Response) {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

      const movers = await analyticsService.getTopMovers(userId);
      res.json({ success: true, data: movers });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async getSnapshots(req: Request, res: Response) {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

      const from = req.query.from as string;
      const to = req.query.to as string;
      if (!from || !to) {
        return res.status(400).json({ success: false, error: 'from and to query params required' });
      }

      const snapshots = await analyticsService.getSnapshots(userId, from, to);
      res.json({ success: true, data: snapshots });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async triggerSnapshot(req: Request, res: Response) {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

      // Import and run for this user only
      const { SnapshotWorker } = await import('../workers/snapshot.worker');
      const worker = new SnapshotWorker();
      await worker.takeSnapshots();
      res.json({ success: true, message: 'Snapshot triggered' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}
