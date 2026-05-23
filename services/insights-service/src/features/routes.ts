import { Router } from 'express';
import { FeatureController } from './controller';

const router = Router();

router.get('/batch', FeatureController.getBatch);
router.get('/:exchange/:symbol', FeatureController.getOne);
router.post('/materialize', FeatureController.materialize);

export { router as featureRoutes };
