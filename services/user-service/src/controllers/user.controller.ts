import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';

const userService = new UserService();

export class UserController {
  static async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing user ID' } });
        return;
      }

      const profile = await userService.getProfile(userId);
      if (!profile) {
        // Auto-create profile on first access
        const newProfile = await userService.updateProfile(userId, {});
        res.json({ success: true, data: newProfile });
        return;
      }

      res.json({ success: true, data: profile });
    } catch (error) {
      next(error);
    }
  }

  static async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) {
        res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing user ID' } });
        return;
      }

      const profile = await userService.updateProfile(userId, req.body);
      res.json({ success: true, data: profile });
    } catch (error) {
      next(error);
    }
  }
}
