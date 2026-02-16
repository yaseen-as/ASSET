import app from './app';
import { config } from './config';
import { AlertService } from './services/alert.service';
import { createLogger } from './utils/logger';

const logger = createLogger('AlertServer');

const alertService = new AlertService();

app.listen(config.port, () => {
  logger.info(`Alert service running on port ${config.port}`);

  // Start the real-time alert evaluation engine
  alertService.startEvaluation();
  logger.info('Alert evaluation engine started');
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down alert service...');
  await alertService.stop();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
