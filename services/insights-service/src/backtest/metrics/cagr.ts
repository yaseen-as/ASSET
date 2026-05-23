// Compound Annual Growth Rate from an equity curve and the actual calendar
// span. `years` should be derived from start/end dates, not trading days,
// to avoid overstating CAGR.
export function cagr(equityStart: number, equityEnd: number, years: number): number {
  if (equityStart <= 0 || years <= 0) return 0;
  return (equityEnd / equityStart) ** (1 / years) - 1;
}
