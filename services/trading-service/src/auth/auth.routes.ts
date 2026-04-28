import { Router } from 'express';
import { AuthController } from './auth.controller';
import { validate } from '../middleware/validate';
import { registerSchema, loginSchema, verifyOtpSchema } from '@platform/shared';

const router = Router();

router.post('/register', validate(registerSchema), AuthController.register);
router.post('/login', validate(loginSchema), AuthController.login);
router.post('/verify-otp', validate(verifyOtpSchema), AuthController.verifyOtp);
router.post('/logout', AuthController.logout);

export { router as authRoutes };
