import { app } from './app';
import { config } from './config';
import { initDatabase } from './config/database';
import { WebSocketManager } from './services/websocket.manager';
import { MockTickGenerator } from './workers/mock-tick-generator';
import { LiveFeedWorker } from './workers/live-feed.worker';

const wsManager = new WebSocketManager();
let mockGenerator: MockTickGenerator | null = null;
let liveFeed: LiveFeedWorker | null = null;

async function start() {
  try {
    await initDatabase();
    console.log('Market Data Service DB initialized');

    // Start WebSocket server for real-time data push to browser clients
    await wsManager.start(config.wsPort);

    if (config.mockTicks) {
      // Dev mode: generate fake ticks locally
      mockGenerator = new MockTickGenerator();
      await mockGenerator.start();
    } else {
      // Production: fetch real quotes from Angel One via broker-service
      liveFeed = new LiveFeedWorker();
      await liveFeed.start();
    }

    app.listen(config.port, () => {
      console.log(`Market Data Service (REST) on port ${config.port}`);
      console.log(`Market Data Service (WS) on port ${config.wsPort}`);
      console.log(`Feed mode: ${config.mockTicks ? 'MOCK' : 'LIVE (Angel One)'}`);
    });
  } catch (error) {
    console.error('Failed to start market data service:', error);
    process.exit(1);
  }
}

start();

process.on('SIGTERM', async () => {
  await mockGenerator?.stop();
  await liveFeed?.stop();
  await wsManager.stop();
  process.exit(0);
});
