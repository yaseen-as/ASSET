import { Router } from 'express';
import { NotificationController } from './notification.controller';

const router = Router();

router.get('/', NotificationController.list);
router.patch('/:id/read', NotificationController.markRead);
router.post('/mark-all-read', NotificationController.markAllRead);
router.get('/preferences', NotificationController.getPreferences);
router.patch('/preferences', NotificationController.updatePreferences);

export { router as notificationRoutes };
