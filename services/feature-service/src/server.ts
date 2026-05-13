import { makeApp } from './app';
import { config } from './config';
import { pingDatabase } from './config/database';

async function start(): Promise<void> {
  try {
    await pingDatabase();
    console.log('Feature Service DB connected');

    const { app, cron } = makeApp();
    if (config.materializationCronEnabled) cron.start();

    app.listen(config.port, () => {
      console.log(`Feature Service running on port ${config.port}`);
    });

    const shutdown = (signal: string) => {
      console.log(`Received ${signal}, draining...`);
      cron.stop();
      process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('Failed to start feature service:', err);
    process.exit(1);
  }
}

start();
