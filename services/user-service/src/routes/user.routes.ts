import { Router } from 'express';
import { UserController } from '../controllers/user.controller';

const router = Router();

router.get('/profile', UserController.getProfile);
router.patch('/profile', UserController.updateProfile);

export { router as userRoutes };
