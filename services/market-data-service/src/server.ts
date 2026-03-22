import { app } from './app';
import { config } from './config';
import { initDatabase } from './config/database';
import { WebSocketManager } from './services/websocket.manager';
import { MockTickGenerator } from './workers/mock-tick-generator';

const wsManager = new WebSocketManager();
let mockGenerator: MockTickGenerator | null = null;

async function start() {
  try {
    await initDatabase();
    console.log('Market Data Service DB initialized');

    // Start WebSocket server for real-time data
    await wsManager.start(config.wsPort);

    // Start mock tick generator in dev mode
    if (config.mockTicks) {
      mockGenerator = new MockTickGenerator();
      await mockGenerator.start();
    }

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
  await mockGenerator?.stop();
  await wsManager.stop();
  process.exit(0);
});
