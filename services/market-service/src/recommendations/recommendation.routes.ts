import { Router } from 'express';
import { RecommendationController } from './recommendation.controller';

const router = Router();

router.get('/', RecommendationController.getRecommendations);
router.get('/personalized', RecommendationController.getPersonalized);

export { router as recommendationRoutes };
