import { Request, Response, NextFunction } from 'express';
import { MarketDataService } from './market-data.service';
import type { Exchange } from '@platform/shared';

let marketDataService: MarketDataService;

export function initMarketController(svc: MarketDataService): void {
  marketDataService = svc;
}

export class MarketController {
  static async getQuote(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { exchange, symbol } = req.params;
      const quote = await marketDataService.getQuote(exchange as Exchange, symbol);
      res.json({ success: true, data: quote });
    } catch (error) { next(error); }
  }

  static async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { exchange, symbol } = req.params;
      const { interval = '1d', from, to } = req.query;
      const data = await marketDataService.getHistorical(
        exchange as Exchange,
        symbol,
        interval as string,
        from as string,
        to as string
      );
      res.json({ success: true, data });
    } catch (error) { next(error); }
  }

  static async getIndicators(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { exchange, symbol } = req.params;
      const indicatorNames = ((req.query.indicators as string) || 'sma_20,ema_50,rsi_14,macd').split(',');
      const data = await marketDataService.getIndicators(exchange as Exchange, symbol, indicatorNames);
      res.json({ success: true, data: { symbol, indicators: data } });
    } catch (error) { next(error); }
  }
}
