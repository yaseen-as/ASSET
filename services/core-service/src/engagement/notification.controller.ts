import { Request, Response, NextFunction } from 'express';
import { NotificationService } from './notification.service';

let notificationService: NotificationService;

export function initNotificationController(svc: NotificationService) {
  notificationService = svc;
}

export class NotificationController {
  static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

      const page = parseInt(req.query.page as string, 10) || 1;
      const result = await notificationService.getNotifications(userId, page);
      res.json({ data: result });
    } catch (err) { next(err); }
  }

  static async markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

      const notification = await notificationService.markRead(req.params.id, userId);
      if (!notification) { res.status(404).json({ error: 'Notification not found' }); return; }
      res.json({ data: notification });
    } catch (err) { next(err); }
  }

  static async markAllRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

      const result = await notificationService.markAllRead(userId);
      res.json({ data: result });
    } catch (err) { next(err); }
  }

  static async getPreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

      const prefs = await notificationService.getPreferences(userId);
      res.json({ data: prefs });
    } catch (err) { next(err); }
  }

  static async updatePreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) { res.status(401).json({ error: 'Unauthorized' }); return; }

      const prefs = await notificationService.updatePreferences(userId, req.body);
      res.json({ data: prefs });
    } catch (err) { next(err); }
  }
}
