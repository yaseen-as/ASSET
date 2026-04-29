import { Router } from 'express';
import { MarketController } from './market.controller';

const router = Router();

router.get('/quote/:exchange/:symbol', MarketController.getQuote);
router.get('/history/:exchange/:symbol', MarketController.getHistory);
router.get('/indicators/:exchange/:symbol', MarketController.getIndicators);

export { router as marketRoutes };
