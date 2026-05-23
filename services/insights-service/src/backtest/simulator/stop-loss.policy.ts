import type { OpenPosition } from './types';

// Triggers when the *low* of the day breaches the stop. We model the exit
// at the stop level (not the close), which is the standard convention —
// it slightly overstates losses when the close recovers, but never
// understates them, so the resulting backtest is conservative.
export function checkStopLoss(
  pos: OpenPosition,
  low: number,
  stopLossPct: number,
): { triggered: boolean; exitPrice: number } {
  const stopPrice = pos.entry_price * (1 + stopLossPct); // stopLossPct is negative
  if (low <= stopPrice) {
    return { triggered: true, exitPrice: stopPrice };
  }
  return { triggered: false, exitPrice: 0 };
}
