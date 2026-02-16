import app from './app';
import { config } from './config';
import { NotificationService } from './services/notification.service';
import { WsNotifier } from './services/ws-notifier';
import { initController } from './controllers/notification.controller';
import { createLogger } from './utils/logger';

const logger = createLogger('NotificationServer');

// Initialise WebSocket notifier & notification service
const wsNotifier = new WsNotifier();
const notificationService = new NotificationService(wsNotifier);

// Wire the service into controllers
initController(notificationService);

app.listen(config.port, () => {
  logger.info(`Notification service running on port ${config.port}`);
  logger.info(`Notification WS server on port ${config.wsPort}`);

  // Start listening for events from other services
  notificationService.startListening();
  logger.info('Event listener started');
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down notification service...');
  await notificationService.stop();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
