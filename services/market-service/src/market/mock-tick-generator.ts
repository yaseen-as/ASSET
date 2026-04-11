import Redis from 'ioredis';
import { config } from '../config';
import { MarketDataRepository } from './market.repository';
import type { WSTickData, OHLCV } from '@platform/shared';

interface SymbolState {
  symbol: string;
  exchange: string;
  lastPrice: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
}

const SEED_PRICES: Record<string, number> = {
  RELIANCE: 2450,
  INFY: 1580,
  SBIN: 620,
  TCS: 3850,
  HDFCBANK: 1650,
  ICICIBANK: 1120,
  KOTAKBANK: 1780,
  LT: 3420,
  AXISBANK: 1050,
  WIPRO: 480,
};

export class MockTickGenerator {
  private redisPub: Redis;
  private repo: MarketDataRepository;
  private symbols: SymbolState[] = [];
  private interval: NodeJS.Timeout | null = null;

  constructor() {
    this.redisPub = new Redis(config.redis.url);
    this.repo = new MarketDataRepository();
  }

  async start(): Promise<void> {
    for (const symbol of config.trackedSymbols) {
      const basePrice = SEED_PRICES[symbol] || 1000;
      this.symbols.push({
        symbol,
        exchange: 'NSE',
        lastPrice: basePrice,
        openPrice: basePrice,
        highPrice: basePrice,
        lowPrice: basePrice,
        volume: 0,
      });
    }

    await this.seedHistoricalData();

    this.interval = setInterval(() => this.generateTicks(), config.mockTickIntervalMs);
    console.log(`[MockTickGenerator] Started for ${this.symbols.length} symbols (every ${config.mockTickIntervalMs}ms)`);
  }

  private async seedHistoricalData(): Promise<void> {
    for (const state of this.symbols) {
      const existing = await this.repo.getLatestCandles(state.symbol, 'NSE' as any, 1);
      if (existing.length > 0) continue;

      console.log(`[MockTickGenerator] Seeding 250 days of data for ${state.symbol}...`);
      const candles = this.generateHistoricalCandles(state.lastPrice, 250);
      await this.repo.upsertDaily(state.symbol, 'NSE' as any, candles);

      state.lastPrice = candles[candles.length - 1].close;
      state.openPrice = state.lastPrice;
      state.highPrice = state.lastPrice;
      state.lowPrice = state.lastPrice;
    }
  }

  private generateHistoricalCandles(startPrice: number, days: number): OHLCV[] {
    const candles: OHLCV[] = [];
    let price = startPrice;

    for (let i = days; i > 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);

      if (date.getDay() === 0 || date.getDay() === 6) continue;

      const changePercent = (Math.random() - 0.48) * 4;
      const open = price;
      const close = price * (1 + changePercent / 100);
      const high = Math.max(open, close) * (1 + Math.random() * 1.5 / 100);
      const low = Math.min(open, close) * (1 - Math.random() * 1.5 / 100);
      const volume = Math.floor(500000 + Math.random() * 5000000);

      candles.push({
        date: date.toISOString().split('T')[0],
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
        volume,
      });

      price = close;
    }

    return candles;
  }

  private async generateTicks(): Promise<void> {
    for (const state of this.symbols) {
      const changePct = (Math.random() - 0.5) * 0.6;
      const newPrice = Math.round(state.lastPrice * (1 + changePct / 100) * 100) / 100;
      const change = Math.round((newPrice - state.openPrice) * 100) / 100;
      const changePercent = Math.round(((newPrice - state.openPrice) / state.openPrice) * 10000) / 100;

      state.lastPrice = newPrice;
      state.highPrice = Math.max(state.highPrice, newPrice);
      state.lowPrice = Math.min(state.lowPrice, newPrice);
      state.volume += Math.floor(Math.random() * 10000);

      const tick: WSTickData & { openPrice: number; highPrice: number; lowPrice: number } = {
        symbol: state.symbol,
        exchange: 'NSE',
        ltp: newPrice,
        change,
        changePercent,
        volume: state.volume,
        timestamp: Date.now(),
        openPrice: state.openPrice,
        highPrice: state.highPrice,
        lowPrice: state.lowPrice,
      };

      const channel = `market:tick:${tick.exchange}:${tick.symbol}`;
      const cacheKey = `market:tick:cache:${tick.exchange}:${tick.symbol}`;
      const payload = JSON.stringify(tick);

      await Promise.all([
        this.redisPub.set(cacheKey, payload, 'EX', 60),
        this.redisPub.publish(channel, payload),
      ]);
    }
  }

  async stop(): Promise<void> {
    if (this.interval) clearInterval(this.interval);
    await this.redisPub.quit();
  }
}
