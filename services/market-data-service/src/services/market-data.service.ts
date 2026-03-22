import Redis from 'ioredis';
import { MarketDataRepository } from '../repositories/market.repository';
import { IndicatorEngine } from './indicator.engine';
import { config } from '../config';
import type { Exchange, HistoricalDataResponse, TechnicalIndicators, Quote, OHLCV } from '@platform/shared';

export class MarketDataService {
  private repo = new MarketDataRepository();
  private indicators = new IndicatorEngine();
  private redis = new Redis(config.redis.url);

  async getQuote(exchange: Exchange, symbol: string): Promise<Quote> {
    // 1. Try Redis tick cache first (populated by mock-tick-generator or real feed)
    const cacheKey = `market:tick:cache:${exchange}:${symbol}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const tick = JSON.parse(cached);
      return {
        symbol,
        exchange,
        ltp: tick.ltp,
        open: tick.openPrice ?? tick.ltp,
        high: tick.highPrice ?? tick.ltp,
        low: tick.lowPrice ?? tick.ltp,
        close: tick.ltp,
        volume: tick.volume ?? 0,
        timestamp: new Date(tick.timestamp).toISOString(),
      };
    }

    // 2. Fall back to latest daily candle from DB
    const candles = await this.repo.getLatestCandles(symbol, exchange, 1);
    if (candles.length === 0) {
      throw new Error(`No data found for ${exchange}:${symbol}`);
    }
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
