import { Queue } from 'bullmq';
import { config } from '../../config';
import { makeQueueConnection } from '../../config/redis';
import type { BacktestRequest } from '../types';

export interface BacktestJobData {
  backtest_id: string;
  request: BacktestRequest;
}

export const backtestQueue = new Queue<BacktestJobData>(config.backtestQueueName, {
  connection: makeQueueConnection(),
  defaultJobOptions: {
    attempts: 1,                // backtests are deterministic — retry policy lives at the API layer
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});

export async function enqueueBacktest(data: BacktestJobData): Promise<void> {
  await backtestQueue.add('run', data, { jobId: data.backtest_id });
}
