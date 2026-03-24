import axios from 'axios';
import Redis from 'ioredis';
import { MarketDataRepository } from '../repositories/market.repository';
import { IndicatorEngine } from './indicator.engine';
import { config } from '../config';
import { createLogger } from '../utils/logger';
import type { Exchange, HistoricalDataResponse, TechnicalIndicators, Quote, OHLCV } from '@platform/shared';

const logger = createLogger('MarketDataService');

export class MarketDataService {
  private repo = new MarketDataRepository();
  private indicators = new IndicatorEngine();
  private redis = new Redis(config.redis.url);

  async getQuote(exchange: Exchange, symbol: string): Promise<Quote> {
    // 1. Try Redis tick cache first (populated by real feed or previous broker fetch)
    const cacheKey = `market:tick:cache:${exchange}:${symbol}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const tick = JSON.parse(cached);
      return {
        symbol,
        exchange,
        ltp: tick.ltp,
        open: tick.openPrice ?? tick.open ?? tick.ltp,
        high: tick.highPrice ?? tick.high ?? tick.ltp,
        low: tick.lowPrice ?? tick.low ?? tick.ltp,
        close: tick.close ?? tick.ltp,
        volume: tick.volume ?? 0,
        timestamp: new Date(tick.timestamp || Date.now()).toISOString(),
      };
    }

    // 2. Fall back to latest daily candle from DB
    const candles = await this.repo.getLatestCandles(symbol, exchange, 1);
    if (candles.length > 0) {
      const latest = candles[0];
      return {
        symbol,
        exchange,
        ltp: latest.close,
        open: latest.open,
        high: latest.high,
        low: latest.low,
        close: latest.close,
        volume: latest.volume,
        timestamp: new Date().toISOString(),
      };
    }

    // 3. Fall back to Angel One via broker-service (real-time quote)
    try {
      logger.info(`Fetching live quote from broker-service for ${exchange}:${symbol}`);
      const { data } = await axios.get(
        `${config.brokerServiceUrl}/api/v1/broker/market/quote/${exchange}/${symbol}`,
        { timeout: 8000 },
      );

      if (data.success && data.data) {
        const q = data.data;

        // Cache in Redis for 30s so subsequent requests don't hit Angel One API
        const tickPayload = JSON.stringify({
          ltp: q.ltp,
          open: q.open,
          high: q.high,
          low: q.low,
          close: q.close,
          volume: q.volume,
          timestamp: Date.now(),
        });
        await this.redis.set(cacheKey, tickPayload, 'EX', 30);

        // Also publish on Redis pub/sub so WebSocket clients get the tick
        await this.redis.publish(
          `market:tick:${exchange}:${symbol}`,
          tickPayload,
        );

        return {
          symbol,
          exchange,
          ltp: q.ltp,
          open: q.open,
          high: q.high,
          low: q.low,
          close: q.close,
          volume: q.volume,
          timestamp: q.timestamp || new Date().toISOString(),
        };
      }
    } catch (brokerErr: any) {
      const msg = brokerErr.response?.data?.error || brokerErr.message;
      logger.warn(`Broker quote fallback failed for ${exchange}:${symbol}: ${msg}`);
    }

    throw new Error(
      `No data found for ${exchange}:${symbol}. Ensure a broker is connected and symbol master is synced.`,
    );
  }

  async getHistorical(
    exchange: Exchange,
    symbol: string,
    interval: string,
    from: string,
    to: string
  ): Promise<HistoricalDataResponse> {
    const candles = await this.repo.getHistorical(symbol, exchange, from, to);
    return {
      symbol,
      exchange,
      interval: interval as HistoricalDataResponse['interval'],
      candles,
    };
  }

  async getIndicators(exchange: Exchange, symbol: string, indicatorNames: string[]): Promise<TechnicalIndicators> {
    const candles = await this.repo.getLatestCandles(symbol, exchange, 200);
    if (candles.length < 20) {
      throw new Error(`Insufficient data for indicators (need 20+, have ${candles.length})`);
    }
    return this.indicators.computeAll(candles);
  }

  async storeCandles(symbol: string, exchange: Exchange, candles: OHLCV[]): Promise<void> {
    await this.repo.upsertDaily(symbol, exchange, candles);
  }
}
