import type { EquityPoint } from '../types';

// Tracks cash + open positions, snapshots daily NAV.
export class EquityTracker {
  cash: number;
  readonly curve: EquityPoint[] = [];

  constructor(initialCapital: number) {
    this.cash = initialCapital;
  }

  snapshot(date: string, openPositionsValue: number): void {
    this.curve.push({ date, equity: this.cash + openPositionsValue });
  }

  reserve(amount: number): boolean {
    if (this.cash < amount) return false;
    this.cash -= amount;
    return true;
  }

  credit(amount: number): void {
    this.cash += amount;
  }
}
