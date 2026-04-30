import type { Request, Response } from 'express';
import { brokerService } from './broker.controller';
import { ServiceError } from './broker.service';

export class MarketController {
  static async getQuote(req: Request, res: Response) {
    try {
      const { exchange, symbol } = req.params;
      if (!exchange || !symbol) {
        return res.status(400).json({ success: false, error: 'exchange and symbol are required' });
      }

      const quote = await brokerService.getQuote(exchange.toUpperCase(), symbol.toUpperCase());
      res.json({ success: true, data: quote });
    } catch (err: any) {
      const status = err instanceof ServiceError ? err.statusCode : 500;
      res.status(status).json({ success: false, error: { code: err.code || 'INTERNAL', message: err.message } });
    }
  }
}
