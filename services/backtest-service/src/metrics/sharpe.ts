// Annualized Sharpe on daily NAV.
// rf is annualized risk-free rate; default 6% (typical India proxy).
export function sharpe(equityCurve: number[], rfAnnual = 0.06): number {
  if (equityCurve.length < 3) return 0;
  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    returns.push(equityCurve[i] / equityCurve[i - 1] - 1);
  }
  const mean = returns.reduce((s, x) => s + x, 0) / returns.length;
  const variance = returns.reduce((s, x) => s + (x - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  const dailyRf = rfAnnual / 252;
  return ((mean - dailyRf) / std) * Math.sqrt(252);
}
