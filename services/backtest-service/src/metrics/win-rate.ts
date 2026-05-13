import type { Trade } from '../types';

export function winRate(trades: Trade[]): number {
  if (trades.length === 0) return 0;
  const wins = trades.filter((t) => t.return_pct > 0).length;
  return wins / trades.length;
}
