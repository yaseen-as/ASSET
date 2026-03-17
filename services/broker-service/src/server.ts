import { app } from './app';
import { config } from './config';
import { initDatabase } from './config/database';
import { OrderTracker } from './workers/order-tracker';
import { SymbolMasterService } from './services/symbol-master.service';

const orderTracker = new OrderTracker();
const symbolMaster = new SymbolMasterService();

async function start() {
  try {
    await initDatabase();
    console.log('Broker Service DB initialized');

    // Start order status tracker
    orderTracker.start();

    // Sync symbol master if stale (>24h)
    symbolMaster.isStale().then(async (stale) => {
      if (stale) {
        console.log('[Broker] Symbol master is stale, syncing...');
        try {
          await symbolMaster.fetchAndSync();
        } catch (err: any) {
          console.error('[Broker] Symbol master sync failed (non-fatal):', err.message);
        }
      }
    });

    app.listen(config.port, () => {
      console.log(`Broker Service running on port ${config.port}`);
    });
  } catch (error) {
    console.error('Failed to start broker service:', error);
    process.exit(1);
  }
}

start();

process.on('SIGTERM', async () => {
  await orderTracker.stop();
  process.exit(0);
});
