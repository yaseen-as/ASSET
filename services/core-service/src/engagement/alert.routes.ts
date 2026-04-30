import { Router } from 'express';
import { AlertController } from './alert.controller';

const router = Router();

router.post('/', AlertController.create);
router.get('/', AlertController.list);
router.get('/:id', AlertController.getById);
router.patch('/:id', AlertController.update);
router.delete('/:id', AlertController.remove);
router.post('/:id/reactivate', AlertController.reactivate);

export { router as alertRoutes };
