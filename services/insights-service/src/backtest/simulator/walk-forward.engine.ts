import { createLogger } from '@platform/shared';
import type { BacktestRequest, BacktestSummary, Trade } from '../types';
import { PriceRepository } from '../data/price.repository';
import { ScoreRepository } from '../data/score.repository';
import { ModelRegistryRepository } from '../../shared/model-registry.repository';
import { EquityTracker } from './equity-tracker';
import { tradingDaysFromOhlcv } from '../utils/trading-days';
import {
  settleOpenPositions,
  forceCloseAll,
  openPosition,
} from './trade.simulator';
import { sharpe, maxDrawdown, winRate, cagr } from '../metrics';
import type { OpenPosition } from './types';

const logger = createLogger('BacktestEngine');

export class WalkForwardEngine {
  constructor(
    private readonly prices: PriceRepository,
    private readonly scores: ScoreRepository,
    private readonly registry: ModelRegistryRepository,
  ) {}

  async run(req: BacktestRequest): Promise<BacktestSummary> {
    const model = await this.registry.getById(req.model_id);
    if (!model) throw new Error(`Model not found: ${req.model_id}`);

    // Universe = every symbol that has at least one score in the period.
    // Loading prices for the same set keeps memory bounded.
    await this.scores.loadAll(model, req.params.exchange, req.start_date, req.end_date);
    await this.prices.load(req.params.exchange, req.start_date, req.end_date);

    const days = await tradingDaysFromOhlcv(req.params.exchange, req.start_date, req.end_date);
    if (days.length === 0) throw new Error('No trading days in range');

    const equity = new EquityTracker(req.params.initial_capital);
    const open = new Map<string, OpenPosition>();
    const trades: Trade[] = [];

    for (let i = 0; i < days.length; i++) {
      const date = days[i];

      const settle = settleOpenPositions(open, date, this.prices, req.params, equity);
      trades.push(...settle.closed);
      open.clear();
      for (const [k, v] of settle.remaining) open.set(k, v);

      // Open new positions on the last day's close ⇒ skip the final day.
      if (i < days.length - 1) {
        const openValue = this.markToMarket(open, date);
        const currentEquity = equity.cash + openValue;
        const topN = this.scores.topN(date, req.params.top_n);
        for (const s of topN) {
          if (open.has(s.symbol)) continue;
          const bar = this.prices.get(s.symbol, date);
          if (!bar) continue;
          const pos = openPosition(s.symbol, req.params.exchange, date, bar.close, req.params, equity, currentEquity);
          if (pos) open.set(s.symbol, pos);
        }
      }

      equity.snapshot(date, this.markToMarket(open, date));
    }

    // Force-close everything still open at the last close.
    const finalDay = days[days.length - 1];
    const finalClosed = forceCloseAll(open, finalDay, this.prices, req.params, equity);
    trades.push(...finalClosed);

    const curveVals = equity.curve.map((p) => p.equity);
    const startCal = new Date(req.start_date).getTime();
    const endCal = new Date(req.end_date).getTime();
    const years = Math.max((endCal - startCal) / (365.25 * 86400000), 1 / 365);

    const summary: BacktestSummary = {
      sharpe_ratio: sharpe(curveVals),
      max_drawdown: maxDrawdown(curveVals),
      win_rate: winRate(trades),
      cagr: cagr(req.params.initial_capital, curveVals[curveVals.length - 1] ?? req.params.initial_capital, years),
      total_trades: trades.length,
      equity_curve: equity.curve,
      trades,
    };

    logger.info(
      `Backtest done: ${trades.length} trades, sharpe=${summary.sharpe_ratio.toFixed(2)}, ` +
        `maxDD=${(summary.max_drawdown * 100).toFixed(1)}%, winRate=${(summary.win_rate * 100).toFixed(1)}%`,
    );
    return summary;
  }

  private markToMarket(open: Map<string, OpenPosition>, date: string): number {
    let v = 0;
    for (const [, pos] of open) {
      const bar = this.prices.get(pos.symbol, date);
      if (!bar) {
        v += pos.cost_basis;   // stale price → assume cost
        continue;
      }
      v += pos.shares * bar.close;
    }
    return v;
  }
}
