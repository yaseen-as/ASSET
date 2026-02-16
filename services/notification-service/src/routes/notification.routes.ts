import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';

const router = Router();

router.get('/', NotificationController.list);
router.patch('/:id/read', NotificationController.markRead);
router.post('/mark-all-read', NotificationController.markAllRead);
router.get('/preferences', NotificationController.getPreferences);
router.patch('/preferences', NotificationController.updatePreferences);

export default router;
