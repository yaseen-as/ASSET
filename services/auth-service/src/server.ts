import { app } from './app';
import { config } from './config';
import { initDatabase } from './config/database';
import { logger } from './utils/logger';

async function start() {
  try {
    // Initialize database
    await initDatabase();
    logger.info('Database initialized');

    // Start server
    app.listen(config.port, () => {
      logger.info(`Auth Service running on port ${config.port}`, { env: config.nodeEnv });
    });
  } catch (error) {
    logger.error('Failed to start auth service', { error });
    process.exit(1);
  }
}

start();

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason });
});
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message });
  process.exit(1);
});
