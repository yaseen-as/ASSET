import { Router } from 'express';
import { ModelsController } from './models.controller';

const router = Router();

router.get('/', ModelsController.list);
router.get('/:id', ModelsController.get);
router.post('/:id/promote', ModelsController.promote);

export { router as modelsRoutes };
