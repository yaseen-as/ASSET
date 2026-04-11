import { Router } from 'express';
import { PortfolioController } from './portfolio.controller';

const router = Router();

router.get('/holdings', PortfolioController.getHoldings);
router.post('/sync', PortfolioController.sync);
router.get('/watchlists', PortfolioController.getWatchlists);
router.post('/watchlists', PortfolioController.createWatchlist);
router.patch('/watchlists/:id', PortfolioController.updateWatchlist);
router.delete('/watchlists/:id', PortfolioController.deleteWatchlist);

export { router as portfolioRoutes };
