import { Request, Response, NextFunction } from 'express';
import { BrokerService } from '../services/broker.service';

const brokerService = new BrokerService();

export class PaperController {
  static async getBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const balance = await brokerService.getPaperBalance(userId);
      res.json({ success: true, data: balance });
    } catch (error) { next(error); }
  }

  static async reset(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      await brokerService.resetPaperAccount(userId);
      res.json({ success: true, message: 'Paper account reset to ₹10,00,000' });
    } catch (error) { next(error); }
  }
}
