import { RuleEngine } from './rule-engine';
import { SignalRepository } from './signal.repository';
import { MarketDataService } from '../market/market-data.service';
import type { OHLCV } from '@platform/shared';

export class SignalGeneratorService {
  private ruleEngine: RuleEngine;
  private signalRepo: SignalRepository;
  // Injected — direct call avoids an HTTP hop within the same service
  private marketDataService: MarketDataService;

  constructor(marketDataService: MarketDataService) {
    this.ruleEngine = new RuleEngine();
    this.signalRepo = new SignalRepository();
    this.marketDataService = marketDataService;
  }

  async generateForSymbol(symbol: string, exchange: string): Promise<number> {
    // Direct call — no HTTP hop, same process
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0];

    const historical = await this.marketDataService.getHistorical(
      exchange as any,
      symbol,
      '1d',
      from,
      to,
    );

    const candles: OHLCV[] = historical.candles || [];
    if (candles.length < 50) {
      console.log(`[SignalGenerator] Insufficient data for ${symbol} (${candles.length} candles, need 50+)`);
      return 0;
    }

    const results = this.ruleEngine.evaluate(symbol, exchange as any, candles);
    let created = 0;

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

  async generateAll(): Promise<number> {
    const symbols = ['RELIANCE', 'INFY', 'SBIN', 'TCS', 'HDFCBANK', 'ICICIBANK', 'KOTAKBANK', 'LT', 'AXISBANK', 'WIPRO'];
    let total = 0;
    for (const symbol of symbols) {
      try {
        total += await this.generateForSymbol(symbol, 'NSE');
      } catch (err: any) {
        console.error(`[SignalGenerator] Failed for ${symbol}: ${err.message}`);
      }
    }

    const deleted = await this.signalRepo.deleteExpired();
    if (deleted > 0) {
      console.log(`[SignalGenerator] Cleaned ${deleted} expired signal(s)`);
    }

    return total;
  }
}
