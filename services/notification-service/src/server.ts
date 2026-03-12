import app from './app';
import { config } from './config';
import { initDatabase } from './config/database';
import { NotificationService } from './services/notification.service';
import { WsNotifier } from './services/ws-notifier';
import { initController } from './controllers/notification.controller';
import { createLogger } from './utils/logger';

const logger = createLogger('NotificationServer');

async function start() {
  try {
    await initDatabase();
    logger.info('Notification service DB initialized');

    const wsNotifier = new WsNotifier();
    const notificationService = new NotificationService(wsNotifier);
    initController(notificationService);

    app.listen(config.port, () => {
      logger.info(`Notification service running on port ${config.port}`);
      logger.info(`Notification WS server on port ${config.wsPort}`);
      notificationService.startListening();
      logger.info('Event listener started');
    });

    const shutdown = async () => {
      logger.info('Shutting down notification service...');
      await notificationService.stop();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.error('Failed to start notification service', { error });
    process.exit(1);
  }
}

start();
