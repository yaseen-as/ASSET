import { Request, Response, NextFunction } from 'express';
import { AuthService, AppError } from './auth.service';

const authService = new AuthService();

export class AuthController {
  static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, phone } = req.body;
      const result = await authService.register(email, password, phone);
      res.status(201).json({
        success: true,
        data: result,
        message: 'Registration successful. OTP sent to phone.',
      });
    } catch (error) {
      next(error);
    }
  }

  static async verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { phone, otp } = req.body;
      await authService.verifyOtp(phone, otp);
      res.json({
        success: true,
        message: 'Phone verified successfully.',
      });
    } catch (error) {
      next(error);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;
      const tokens = await authService.login(email, password);
      res.json({
        success: true,
        data: tokens,
      });
    } catch (error) {
      next(error);
    }
  }

  static async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) {
        throw new AppError('User ID required', 'UNAUTHORIZED', 401);
      }
      res.json({ success: true, message: 'Logged out successfully.' });
    } catch (error) {
      next(error);
    }
  }
}
