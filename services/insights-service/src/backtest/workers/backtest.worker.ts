import { Worker, Job } from 'bullmq';
import { createLogger } from '@platform/shared';
import { config } from '../../config';
import { makeQueueConnection, makePubSubConnection } from '../../config/redis';
import { BacktestRepository } from '../data/backtest.repository';
import { PriceRepository } from '../data/price.repository';
import { ScoreRepository } from '../data/score.repository';
import { ModelRegistryRepository } from '../../shared/model-registry.repository';
import { WalkForwardEngine } from '../simulator/walk-forward.engine';
import type { BacktestJobData } from '../queue/backtest.queue';

const logger = createLogger('BacktestWorker');

export function startBacktestWorker(registry: ModelRegistryRepository): Worker {
  const publisher = makePubSubConnection();
  const repo = new BacktestRepository();

  const worker = new Worker<BacktestJobData>(
    config.backtestQueueName,
    async (job: Job<BacktestJobData>) => {
      const { backtest_id, request } = job.data;
      logger.info(`Running backtest ${backtest_id} for model ${request.model_id}`);
      const engine = new WalkForwardEngine(new PriceRepository(), new ScoreRepository(), registry);
      const summary = await engine.run(request);
      await repo.saveResult(backtest_id, summary);
      await publisher.publish(`backtest:done:${backtest_id}`, JSON.stringify({
        status: 'completed',
        sharpe: summary.sharpe_ratio,
        total_trades: summary.total_trades,
      }));
      return { backtest_id, ok: true };
    },
    {
      connection: makeQueueConnection(),
      concurrency: config.backtestConcurrency,
    },
  );

  worker.on('completed', (job) => logger.info(`Job ${job.id} completed`));
  worker.on('failed', (job, err) => logger.error(`Job ${job?.id} failed: ${err.message}`));

  return worker;
}
