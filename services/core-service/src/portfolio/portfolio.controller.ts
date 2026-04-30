import { Request, Response, NextFunction } from 'express';
import { PortfolioService } from './portfolio.service';

let portfolioService: PortfolioService;

export function initPortfolioController(svc: PortfolioService): void {
  portfolioService = svc;
}

export class PortfolioController {
  static async getHoldings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const summary = await portfolioService.getHoldings(userId);
      res.json({ success: true, data: summary });
    } catch (error) { next(error); }
  }

  static async sync(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const result = await portfolioService.syncFromBroker(userId);
      res.json({ success: true, data: result, message: 'Portfolio synced.' });
    } catch (error) { next(error); }
  }

  static async getWatchlists(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const watchlists = await portfolioService.getWatchlists(userId);
      res.json({ success: true, data: watchlists });
    } catch (error) { next(error); }
  }

  static async createWatchlist(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const watchlist = await portfolioService.createWatchlist(userId, req.body);
      res.status(201).json({ success: true, data: watchlist });
    } catch (error) { next(error); }
  }

  static async updateWatchlist(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const watchlist = await portfolioService.updateWatchlist(userId, req.params.id, req.body);
      res.json({ success: true, data: watchlist });
    } catch (error) { next(error); }
  }

  static async deleteWatchlist(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      await portfolioService.deleteWatchlist(userId, req.params.id);
      res.json({ success: true, message: 'Watchlist deleted.' });
    } catch (error) { next(error); }
  }
}
