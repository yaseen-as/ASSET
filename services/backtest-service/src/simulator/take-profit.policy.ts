import type { OpenPosition } from './types';

// Triggers when the *high* of the day breaches the target. Exit at the
// target level — conservative versus exiting at the close.
export function checkTakeProfit(
  pos: OpenPosition,
  high: number,
  takeProfitPct: number,
): { triggered: boolean; exitPrice: number } {
  const targetPrice = pos.entry_price * (1 + takeProfitPct);
  if (high >= targetPrice) {
    return { triggered: true, exitPrice: targetPrice };
  }
  return { triggered: false, exitPrice: 0 };
}
