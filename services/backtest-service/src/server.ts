import { app } from './app';
import { config } from './config';
import { pingDatabase } from './config/database';
import { startWorker } from './workers/backtest.worker';

async function start(): Promise<void> {
  try {
    await pingDatabase();
    console.log('Backtest Service DB connected');

    const worker = startWorker();
    console.log(`Backtest worker started (concurrency=${config.queue.concurrency})`);

    app.listen(config.port, () => {
      console.log(`Backtest Service running on port ${config.port}`);
    });

    const shutdown = async (signal: string) => {
      console.log(`Received ${signal}, draining...`);
      await worker.close();
      process.exit(0);
    };
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
  } catch (err) {
    console.error('Failed to start backtest service:', err);
    process.exit(1);
  }
}

start();
