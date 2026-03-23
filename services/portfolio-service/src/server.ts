import { app } from './app';
import { config } from './config';
import { initDatabase } from './config/database';
import { SnapshotWorker } from './workers/snapshot.worker';

async function start() {
  try {
    await initDatabase();
    console.log('Portfolio Service DB initialized');

    // Start snapshot worker (daily portfolio snapshots)
    const snapshotWorker = new SnapshotWorker();
    snapshotWorker.start();

    app.listen(config.port, () => {
      console.log(`Portfolio Service running on port ${config.port}`);
    });
  } catch (error) {
    console.error('Failed to start portfolio service:', error);
    process.exit(1);
  }
}
start();
