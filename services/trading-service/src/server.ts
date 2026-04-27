import { app } from './app';
import { config } from './config';
import { initDatabase, initEngagementDatabase } from './config/database';
import { UpstoxInstrumentService } from './broker/upstox-instrument.service';
import { BrokerService } from './broker/broker.service';
import { PortfolioService } from './portfolio/portfolio.service';
import { initPortfolioController } from './portfolio/portfolio.controller';
import { AlertService } from './engagement/alert.service';
import { NotificationService } from './engagement/notification.service';
import { EvaluationEngine } from './engagement/evaluation.engine';
import { initNotificationController } from './engagement/notification.controller';

const symbolMaster = new UpstoxInstrumentService();

async function start() {
  try {
    await initDatabase();
    console.log('Trading Service DB initialized (broker + portfolio)');

    await initEngagementDatabase();
    console.log('Trading Service DB initialized (engagement)');

    const brokerService = new BrokerService();
    const portfolioService = new PortfolioService(brokerService);
    initPortfolioController(portfolioService);

    const alertService = new AlertService();
    const notificationService = new NotificationService();
    initNotificationController(notificationService);

    const evaluationEngine = new EvaluationEngine(
      alertService.getRepository(),
      notificationService,
    );
    evaluationEngine.start();
    notificationService.startListening();

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

    const shutdown = async () => {
      await evaluationEngine.stop();
      await notificationService.stop();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error('Failed to start trading service:', error);
    process.exit(1);
  }
}

start();
