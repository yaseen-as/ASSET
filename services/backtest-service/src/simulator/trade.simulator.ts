import type { BacktestParams, Trade } from '../types';
import { PriceRepository } from '../data/price.repository';
import { EquityTracker } from './equity-tracker';
import { checkStopLoss } from './stop-loss.policy';
import { checkTakeProfit } from './take-profit.policy';
import { daysBetween } from '../utils/trading-days';
import type { OpenPosition } from './types';

interface SettleResult {
  closed: Trade[];
  remaining: Map<string, OpenPosition>;
}

// Settles open positions at the start of `date`. The day's high/low is used
// for stop/target checks; close is used for max-holding forced exits.
export function settleOpenPositions(
  open: Map<string, OpenPosition>,
  date: string,
  prices: PriceRepository,
  params: BacktestParams,
  equity: EquityTracker,
): SettleResult {
  const closed: Trade[] = [];
  const remaining = new Map(open);

  for (const [symbol, pos] of open) {
    const bar = prices.get(symbol, date);
    if (!bar) continue;     // symbol didn't trade today; carry position forward

    const holdingDays = daysBetween(pos.entry_date, date);

    // Order matters: stop-loss is checked before take-profit by convention
    // (worst-case modeling — if both could trigger intra-day we assume stop).
    const sl = checkStopLoss(pos, bar.low, params.stop_loss);
    if (sl.triggered) {
      closed.push(closePosition(pos, date, sl.exitPrice, 'stop_loss', params, equity, holdingDays));
      remaining.delete(symbol);
      continue;
    }
    const tp = checkTakeProfit(pos, bar.high, params.take_profit);
    if (tp.triggered) {
      closed.push(closePosition(pos, date, tp.exitPrice, 'take_profit', params, equity, holdingDays));
      remaining.delete(symbol);
      continue;
    }
    if (holdingDays >= params.max_holding_days) {
      closed.push(closePosition(pos, date, bar.close, 'max_holding', params, equity, holdingDays));
      remaining.delete(symbol);
    }
  }

  return { closed, remaining };
}

export function forceCloseAll(
  open: Map<string, OpenPosition>,
  date: string,
  prices: PriceRepository,
  params: BacktestParams,
  equity: EquityTracker,
): Trade[] {
  const out: Trade[] = [];
  for (const [, pos] of open) {
    const bar = prices.get(pos.symbol, date);
    if (!bar) continue;
    out.push(closePosition(pos, date, bar.close, 'end_of_backtest', params, equity, daysBetween(pos.entry_date, date)));
  }
  return out;
}

// Opens a position sized at params.position_size_fraction of current equity.
// Entry-side cost is deducted now; exit-side cost is deducted at close.
export function openPosition(
  symbol: string,
  exchange: string,
  date: string,
  entryClose: number,
  params: BacktestParams,
  equity: EquityTracker,
  currentEquity: number,
): OpenPosition | null {
  const notional = currentEquity * params.position_size_fraction;
  if (notional < entryClose) return null;
  const shares = Math.floor(notional / entryClose);
  if (shares === 0) return null;
  const grossCost = shares * entryClose;
  const entryFee = grossCost * (params.cost_bps / 10000 / 2); // half of round-trip
  const totalCost = grossCost + entryFee;
  if (!equity.reserve(totalCost)) return null;
  return {
    symbol,
    exchange,
    entry_date: date,
    entry_price: entryClose,
    shares,
    cost_basis: totalCost,
  };
}

function closePosition(
  pos: OpenPosition,
  exitDate: string,
  exitPrice: number,
  reason: Trade['exit_reason'],
  params: BacktestParams,
  equity: EquityTracker,
  holdingDays: number,
): Trade {
  const grossProceeds = pos.shares * exitPrice;
  const exitFee = grossProceeds * (params.cost_bps / 10000 / 2);
  const netProceeds = grossProceeds - exitFee;
  equity.credit(netProceeds);
  const pnl = netProceeds - pos.cost_basis;
  const return_pct = pos.cost_basis > 0 ? pnl / pos.cost_basis : 0;
  return {
    symbol: pos.symbol,
    exchange: pos.exchange,
    entry_date: pos.entry_date,
    entry_price: pos.entry_price,
    exit_date: exitDate,
    exit_price: exitPrice,
    holding_days: holdingDays,
    pnl,
    return_pct,
    exit_reason: reason,
  };
}
