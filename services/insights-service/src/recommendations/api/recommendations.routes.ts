import { Router } from 'express';
import { RecommendationController } from './recommendations.controller';

const router = Router();

router.get('/top', RecommendationController.getTop);
router.post('/score', RecommendationController.scoreSymbol);
router.post('/rank', RecommendationController.rankUniverse);

export { router as recommendationRoutes };
