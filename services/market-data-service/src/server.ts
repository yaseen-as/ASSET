import { app } from './app';
import { config } from './config';
import { initDatabase } from './config/database';
import { WebSocketManager } from './services/websocket.manager';

const wsManager = new WebSocketManager();

async function start() {
  try {
    await initDatabase();
    console.log('Market Data Service DB initialized');

    // Start WebSocket server for real-time data
    await wsManager.start(config.wsPort);

    app.listen(config.port, () => {
      console.log(`Market Data Service (REST) on port ${config.port}`);
      console.log(`Market Data Service (WS) on port ${config.wsPort}`);
    });
  } catch (error) {
    console.error('Failed to start market data service:', error);
    process.exit(1);
  }
}

start();

process.on('SIGTERM', async () => {
  await wsManager.stop();
  process.exit(0);
});
