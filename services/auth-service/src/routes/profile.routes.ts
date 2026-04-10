import { Router } from 'express';
import { ProfileController } from '../controllers/profile.controller';

const router = Router();

router.get('/profile', ProfileController.getProfile);
router.patch('/profile', ProfileController.updateProfile);

export { router as profileRoutes };
