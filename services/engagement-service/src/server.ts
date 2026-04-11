import app from './app';
import { config } from './config';
import { initDatabase } from './config/database';
import { AlertService } from './alerts/alert.service';
import { NotificationService } from './notifications/notification.service';
import { initNotificationController } from './notifications/notification.controller';
import { EvaluationEngine } from './services/evaluation.engine';
import { WsNotifier } from './services/ws-notifier';
import { createLogger } from './utils/logger';

const logger = createLogger('EngagementServer');

async function start() {
  try {
    await initDatabase();
    logger.info('Engagement service DB initialized (alerts + notifications)');

    // Wire up dependencies
    const wsNotifier = new WsNotifier();
    const alertService = new AlertService();
    const notificationService = new NotificationService(wsNotifier);

    // Inject into controller (notification controller needs the service instance)
    initNotificationController(notificationService);

    // Evaluation engine: subscribes to market ticks, evaluates alerts,
    // calls notificationService directly when alerts trigger
    const evaluationEngine = new EvaluationEngine(
      alertService.getRepository(),
      notificationService,
    );

    app.listen(config.port, () => {
      logger.info(`Engagement service running on port ${config.port}`);
      logger.info(`WebSocket server on port ${config.wsPort}`);

      evaluationEngine.start();
      logger.info('Alert evaluation engine started');

      notificationService.startListening();
      logger.info('Notification event listener started');
    });

    const shutdown = async () => {
      logger.info('Shutting down engagement service...');
      await evaluationEngine.stop();
      await notificationService.stop();
      wsNotifier.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.error('Failed to start engagement service', { error });
    process.exit(1);
  }
}

start();
