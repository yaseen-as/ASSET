import { app } from './app';
import { config } from './config';
import { initDatabase } from './config/database';
import { OrderTracker } from './workers/order-tracker';
import { UpstoxInstrumentService } from './broker/upstox-instrument.service';
import { BrokerService } from './broker/broker.service';
import { PortfolioService } from './portfolio/portfolio.service';
import { initPortfolioController } from './portfolio/portfolio.controller';

const orderTracker = new OrderTracker();
const symbolMaster = new UpstoxInstrumentService();

async function start() {
  try {
    await initDatabase();
    console.log('Trading Service DB initialized');

    // Wire portfolio domain: inject BrokerService so it never needs HTTP to itself
    const brokerService = new BrokerService();
    const portfolioService = new PortfolioService(brokerService);
    initPortfolioController(portfolioService);

    // Start order status tracker
    orderTracker.start();

    // Sync symbol master if stale (>24h)
    symbolMaster.isStale().then(async (stale) => {
      if (stale) {
        console.log('[Trading] Symbol master is stale, syncing...');
        try {
          await symbolMaster.fetchAndSync();
        } catch (err: any) {
          console.error('[Trading] Symbol master sync failed (non-fatal):', err.message);
        }
      }
    }).catch((err: any) => {
      console.error('[Trading] Symbol master stale-check failed:', err.message);
    });

    app.listen(config.port, () => {
      console.log(`Trading Service running on port ${config.port}`);
    });
  } catch (error) {
    console.error('Failed to start trading service:', error);
    process.exit(1);
  }
}

start();

process.on('SIGTERM', async () => {
  await orderTracker.stop();
  process.exit(0);
});
