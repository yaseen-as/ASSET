import { app } from './app';
import { config } from './config';
import { initDatabase } from './config/database';

async function start() {
  try {
    await initDatabase();
    console.log('Recommendation Service DB initialized');
    app.listen(config.port, () => {
      console.log(`Recommendation Service running on port ${config.port}`);
    });
  } catch (error) {
    console.error('Failed to start recommendation service:', error);
    process.exit(1);
  }
}
start();
