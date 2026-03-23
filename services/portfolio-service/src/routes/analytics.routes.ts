import { Router } from 'express';
import { AnalyticsController } from '../controllers/analytics.controller';

const router = Router();

router.get('/summary', AnalyticsController.getSummary);
router.get('/pnl', AnalyticsController.getPnlHistory);
router.get('/allocation', AnalyticsController.getAllocation);
router.get('/movers', AnalyticsController.getTopMovers);
router.get('/snapshots', AnalyticsController.getSnapshots);
router.post('/snapshots/trigger', AnalyticsController.triggerSnapshot);

export { router as analyticsRoutes };
