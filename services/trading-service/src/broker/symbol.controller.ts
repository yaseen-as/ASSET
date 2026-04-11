import { Request, Response, NextFunction } from 'express';
import { brokerService } from './broker.controller';

export class SymbolController {
  static async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query.q as string || '';
      const exchange = req.query.exchange as string | undefined;
      const limit = parseInt(req.query.limit as string || '10', 10);
      const results = await brokerService.searchSymbols(query, exchange, limit);
      res.json({ success: true, data: results });
    } catch (error) { next(error); }
  }

  static async getSymbol(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const info = await brokerService.getSymbolInfo(req.params.symbol, req.params.exchange);
      if (!info) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Symbol not found' } });
        return;
      }
      res.json({ success: true, data: info });
    } catch (error) { next(error); }
  }

  static async syncMaster(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await brokerService.syncSymbolMaster();
      res.json({ success: true, data: result });
    } catch (error) { next(error); }
  }
}
