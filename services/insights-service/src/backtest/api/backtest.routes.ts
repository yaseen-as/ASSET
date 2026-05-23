import { Router } from 'express';
import { BacktestController } from './backtest.controller';

const router = Router();

router.post('/runs', BacktestController.createRun);
router.get('/runs/:id', BacktestController.getRun);
router.get('/results', BacktestController.listResults);

export { router as backtestRoutes };
