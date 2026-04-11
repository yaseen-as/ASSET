import { app } from './app';
import { config } from './config';
import { initDatabase } from './config/database';
import { WebSocketManager } from './market/websocket.manager';
import { MockTickGenerator } from './market/mock-tick-generator';
import { MarketDataService } from './market/market-data.service';
import { SignalGeneratorService } from './recommendations/signal-generator.service';
import { SignalScheduler } from './recommendations/signal.scheduler';
import { initMarketController } from './market/market.controller';

const wsManager = new WebSocketManager();
let mockGenerator: MockTickGenerator | null = null;

async function start() {
  try {
    await initDatabase();
    console.log('Market Service DB initialized');

    // Wire market domain — inject into controller
    const marketDataService = new MarketDataService();
    initMarketController(marketDataService);

    // Wire recommendations domain — inject MarketDataService so it never HTTP-calls itself
    const signalGenerator = new SignalGeneratorService(marketDataService);
    const signalScheduler = new SignalScheduler(signalGenerator);
    signalScheduler.start();

    // Start WebSocket server for real-time tick streaming
    await wsManager.start(config.wsPort);

    // Start mock tick generator in dev mode
    if (config.mockTicks) {
      mockGenerator = new MockTickGenerator();
      await mockGenerator.start();
    }

    app.listen(config.port, () => {
      console.log(`Market Service (REST) on port ${config.port}`);
      console.log(`Market Service (WS) on port ${config.wsPort}`);
    });
  } catch (error) {
    console.error('Failed to start market service:', error);
    process.exit(1);
  }
}

start();

process.on('SIGTERM', async () => {
  await mockGenerator?.stop();
  await wsManager.stop();
  process.exit(0);
});
