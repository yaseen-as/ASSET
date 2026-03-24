import type { Request, Response, NextFunction } from 'express';
import { BrokerService } from '../services/broker.service';

const brokerService = new BrokerService();

export class MarketController {
  static async getQuote(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { exchange, symbol } = req.params;
      if (!exchange || !symbol) {
        res.status(400).json({ success: false, error: 'exchange and symbol required' });
        return;
      }

      const quote = await brokerService.getMarketQuote(exchange, symbol);
      res.json({
        success: true,
        data: {
          symbol,
          exchange,
          ...quote,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      if (error.statusCode) {
        res.status(error.statusCode).json({ success: false, error: error.message });
        return;
      }
      next(error);
    }
  }
}
