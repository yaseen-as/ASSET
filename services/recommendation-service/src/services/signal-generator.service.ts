import axios from 'axios';
import { RuleEngine } from './rule-engine';
import { SignalRepository } from '../repositories/signal.repository';
import { config } from '../config';
import type { OHLCV } from '@platform/shared';

export class SignalGeneratorService {
  private ruleEngine: RuleEngine;
  private signalRepo: SignalRepository;

  constructor() {
    this.ruleEngine = new RuleEngine();
    this.signalRepo = new SignalRepository();
  }

  async generateForSymbol(symbol: string, exchange: string): Promise<number> {
    // Fetch 250 daily candles from market-data-service
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0];

    const { data: response } = await axios.get(
      `${config.marketDataServiceUrl}/api/v1/market/history/${exchange}/${symbol}`,
      { params: { interval: '1d', from, to }, timeout: 10000 },
    );

    const candles: OHLCV[] = response.data?.candles || [];
    if (candles.length < 50) {
      console.log(`[SignalGenerator] Insufficient data for ${symbol} (${candles.length} candles, need 50+)`);
      return 0;
    }

    // Run rule engine
    const results = this.ruleEngine.evaluate(symbol, exchange as any, candles);
    let created = 0;

    // Store new signals (skip duplicates within 24h)
    for (const result of results) {
      const existing = await this.signalRepo.findRecent(symbol, exchange, result.ruleName, 24);
      if (existing) continue;

      await this.signalRepo.createSignal({
        symbol,
        exchange,
        signal_type: result.signalType,
        source: 'rule_engine',
        confidence: result.confidence,
        reasoning: result.reasoning,
        metadata: { ruleName: result.ruleName },
        valid_until: new Date(Date.now() + 24 * 3600000),
      });
      created++;
    }

    if (created > 0) {
      console.log(`[SignalGenerator] Created ${created} signal(s) for ${exchange}:${symbol}`);
    }
    return created;
  }

  async generateForAllSymbols(): Promise<number> {
    let total = 0;
    for (const symbol of config.trackedSymbols) {
      try {
        total += await this.generateForSymbol(symbol, 'NSE');
      } catch (err: any) {
        console.error(`[SignalGenerator] Failed for ${symbol}: ${err.message}`);
      }
    }

    // Clean up expired signals
    const deleted = await this.signalRepo.deleteExpired();
    if (deleted > 0) {
      console.log(`[SignalGenerator] Cleaned ${deleted} expired signal(s)`);
    }

    return total;
  }
}
