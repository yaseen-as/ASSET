import { Request, Response, NextFunction } from 'express';
import { BrokerService } from '../services/broker.service';

const brokerService = new BrokerService();

export class OrderController {
  static async placeOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const result = await brokerService.placeOrder(userId, req.body);
      res.status(201).json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  static async getOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const limit = Math.min(parseInt(req.query.limit as string || '20', 10), 100);
      const page = parseInt(req.query.page as string || '1', 10);
      const offset = (page - 1) * limit;
      const status = req.query.status as string | undefined;
      const source = req.query.source as string | undefined;

      const { orders, total } = await brokerService.getOrders(userId, { status, source }, limit, offset);
      res.json({
        success: true,
        data: orders,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) { next(error); }
  }

  static async getOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const order = await brokerService.getOrder(userId, req.params.orderId);
      res.json({ success: true, data: order });
    } catch (error) { next(error); }
  }

  static async getOrderStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const stats = await brokerService.getOrderStats(userId);
      res.json({ success: true, data: stats });
    } catch (error) { next(error); }
  }

  static async cancelOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      await brokerService.cancelOrder(userId, req.params.orderId);
      res.json({ success: true, message: 'Order cancelled' });
    } catch (error) { next(error); }
  }
}
