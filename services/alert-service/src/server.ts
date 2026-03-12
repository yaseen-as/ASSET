import app from './app';
import { config } from './config';
import { initDatabase } from './config/database';
import { AlertService } from './services/alert.service';
import { createLogger } from './utils/logger';

const logger = createLogger('AlertServer');

async function start() {
  try {
    await initDatabase();
    logger.info('Alert service DB initialized');

    const alertService = new AlertService();

    app.listen(config.port, () => {
      logger.info(`Alert service running on port ${config.port}`);
      alertService.startEvaluation();
      logger.info('Alert evaluation engine started');
    });

    const shutdown = async () => {
      logger.info('Shutting down alert service...');
      await alertService.stop();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.error('Failed to start alert service', { error });
    process.exit(1);
  }
}

start();
