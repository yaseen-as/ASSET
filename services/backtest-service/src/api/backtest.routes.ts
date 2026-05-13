import { Router } from 'express';
import { createBacktestRun, getBacktestRun, listBacktestResults } from './backtest.controller';

const router = Router();

router.post('/runs', createBacktestRun);
router.get('/runs/:id', getBacktestRun);
router.get('/results', listBacktestResults);

export { router as backtestRoutes };
