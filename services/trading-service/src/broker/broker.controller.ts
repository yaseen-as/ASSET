import { Request, Response, NextFunction } from 'express';
import { BrokerService } from './broker.service';

const brokerService = new BrokerService();

export class BrokerController {
  static async connect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const connection = await brokerService.connect(userId, req.body);
      res.status(201).json({ success: true, data: connection });
    } catch (error) { next(error); }
  }

  static async disconnect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      await brokerService.disconnect(userId, req.params.connectionId);
      res.json({ success: true, message: 'Disconnected successfully.' });
    } catch (error) { next(error); }
  }

  static async getConnections(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const connections = await brokerService.getConnections(userId);
      res.json({ success: true, data: connections });
    } catch (error) { next(error); }
  }

  static async toggle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const connection = await brokerService.toggleConnection(userId, req.params.connectionId, req.body.isActive);
      res.json({ success: true, data: connection });
    } catch (error) { next(error); }
  }

  static async getHoldings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const holdings = await brokerService.getHoldings(userId, req.params.connectionId);
      res.json({ success: true, data: holdings });
    } catch (error) { next(error); }
  }

  static async getFeedTokens(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const tokens = await brokerService.getFeedTokens(userId);
      res.json({ success: true, data: tokens });
    } catch (error) { next(error); }
  }

  static async getActiveFeedTokens(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tokens = await brokerService.getActiveFeedTokens();
      res.json({ success: true, data: tokens });
    } catch (error) { next(error); }
  }
}

export { brokerService };
