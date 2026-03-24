import axios from 'axios';
import Redis from 'ioredis';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('LiveFeedWorker');

/**
 * LiveFeedWorker polls Angel One's market quote API (via broker-service)
 * for all tracked symbols and pushes ticks into Redis.
 *
 * Flow:
 *  1. On start, fetch active feed tokens from broker-service to verify auth
 *  2. Resolve symbol tokens for all tracked symbols via broker-service
 *  3. Every POLL_INTERVAL, batch-fetch quotes via broker-service
 *  4. Write each tick to Redis SET (cache) + PUBLISH (pub/sub)
 *
 * This replaces MockTickGenerator with real market data.
 */

interface SymbolToken {
  symbol: string;
  exchange: string;
  token: string;
}

export class LiveFeedWorker {
  private redisPub: Redis;
  private symbolTokens: SymbolToken[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollIntervalMs: number;
  private isRunning = false;
  private consecutiveFailures = 0;
  private readonly MAX_FAILURES = 10;

  constructor() {
    this.redisPub = new Redis(config.redis.url);
    // Poll every 5 seconds by default (batch call, so only 1 API call per interval)
    this.pollIntervalMs = parseInt(process.env.FEED_POLL_INTERVAL_MS || '5000', 10);
  }

  async start(): Promise<void> {
    logger.info('Starting live feed worker...');

    // 1. Verify broker connectivity and resolve symbol tokens
    await this.resolveSymbolTokens();

    if (this.symbolTokens.length === 0) {
      logger.warn('No symbol tokens resolved. Feed will retry every 30s until broker is connected and symbols are synced.');
      this.pollTimer = setInterval(() => this.retryInit(), 30_000);
      return;
    }

    // 2. Start polling
    this.isRunning = true;
    this.consecutiveFailures = 0;
    await this.pollQuotes(); // First poll immediately
    this.pollTimer = setInterval(() => this.pollQuotes(), this.pollIntervalMs);
    logger.info(`Live feed started for ${this.symbolTokens.length} symbols (polling every ${this.pollIntervalMs}ms)`);
  }

  private async retryInit(): Promise<void> {
    try {
      await this.resolveSymbolTokens();
      if (this.symbolTokens.length > 0) {
        // Success — stop retry timer, start real polling
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.isRunning = true;
        this.consecutiveFailures = 0;
        await this.pollQuotes();
        this.pollTimer = setInterval(() => this.pollQuotes(), this.pollIntervalMs);
        logger.info(`Live feed started for ${this.symbolTokens.length} symbols after retry`);
      }
    } catch (err: any) {
      logger.warn(`Feed init retry failed: ${err.message}`);
    }
  }

  /**
   * Resolve tracked symbols to Angel One token IDs via broker-service.
   */
  private async resolveSymbolTokens(): Promise<void> {
    this.symbolTokens = [];

    for (const symbol of config.trackedSymbols) {
      try {
        const { data } = await axios.get(
          `${config.brokerServiceUrl}/api/v1/broker/symbols/NSE/${symbol}`,
          { timeout: 5000 },
        );
        if (data.success && data.data?.token) {
          this.symbolTokens.push({
            symbol,
            exchange: 'NSE',
            token: data.data.token,
          });
        }
      } catch (err: any) {
        logger.warn(`Could not resolve token for ${symbol}: ${err.message}`);
      }
    }

    logger.info(`Resolved ${this.symbolTokens.length}/${config.trackedSymbols.length} symbol tokens`);
  }

  /**
   * Batch-fetch quotes for all tracked symbols from broker-service.
   * broker-service calls Angel One's POST /market/v1/quote/ internally.
   */
  private async pollQuotes(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Fetch quotes one-by-one via broker-service (each call goes to Angel One)
      // We do them in parallel with concurrency limit
      const batchSize = 5;
      for (let i = 0; i < this.symbolTokens.length; i += batchSize) {
        const batch = this.symbolTokens.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(st => this.fetchAndPublish(st)),
        );

        // Log failures
        for (let j = 0; j < results.length; j++) {
          if (results[j].status === 'rejected') {
            const reason = (results[j] as PromiseRejectedResult).reason;
            logger.warn(`Quote failed for ${batch[j].symbol}: ${reason.message || reason}`);
          }
        }
      }

      this.consecutiveFailures = 0;
    } catch (err: any) {
      this.consecutiveFailures++;
      logger.error(`Poll cycle failed (${this.consecutiveFailures}/${this.MAX_FAILURES}): ${err.message}`);

      if (this.consecutiveFailures >= this.MAX_FAILURES) {
        logger.error('Too many consecutive failures. Pausing feed for 60s...');
        this.isRunning = false;
        setTimeout(() => {
          this.isRunning = true;
          this.consecutiveFailures = 0;
          logger.info('Resuming feed after pause');
        }, 60_000);
      }
    }
  }

  /**
   * Fetch a single symbol's quote and publish to Redis.
   */
  private async fetchAndPublish(st: SymbolToken): Promise<void> {
    const { data } = await axios.get(
      `${config.brokerServiceUrl}/api/v1/broker/market/quote/${st.exchange}/${st.symbol}`,
      { timeout: 8000 },
    );

    if (!data.success || !data.data) return;

    const q = data.data;
    const tick = {
      symbol: st.symbol,
      exchange: st.exchange,
      ltp: q.ltp,
      open: q.open,
      high: q.high,
      low: q.low,
      close: q.close,
      volume: q.volume,
      change: Math.round((q.ltp - q.close) * 100) / 100,
      changePercent: q.close > 0
        ? Math.round(((q.ltp - q.close) / q.close) * 10000) / 100
        : 0,
      openPrice: q.open,
      highPrice: q.high,
      lowPrice: q.low,
      timestamp: Date.now(),
    };

    const channel = `market:tick:${st.exchange}:${st.symbol}`;
    const cacheKey = `market:tick:cache:${st.exchange}:${st.symbol}`;
    const payload = JSON.stringify(tick);

    // Cache tick (TTL 60s) + publish for WebSocket subscribers
    await Promise.all([
      this.redisPub.set(cacheKey, payload, 'EX', 60),
      this.redisPub.publish(channel, payload),
    ]);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    await this.redisPub.quit();
    logger.info('Live feed worker stopped');
  }
}
