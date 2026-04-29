import { app } from './app';
import { config } from './config';
import { initDatabase } from './config/database';
import { MarketDataService } from './market/market-data.service';
import { SignalGeneratorService } from './recommendations/signal-generator.service';
import { initMarketController } from './market/market.controller';
import { initRecommendationController } from './recommendations/recommendation.controller';

async function start() {
  try {
    await initDatabase();
    console.log('Market Service DB initialized');

    const marketDataService = new MarketDataService();
    const signalGenerator = new SignalGeneratorService(marketDataService);

    initMarketController(marketDataService);
    initRecommendationController(signalGenerator);

    app.listen(config.port, () => {
      console.log(`Market Service running on port ${config.port}`);
    });
  } catch (error) {
    console.error('Failed to start market service:', error);
    process.exit(1);
  }
}

start();

process.on('SIGTERM', () => process.exit(0));
