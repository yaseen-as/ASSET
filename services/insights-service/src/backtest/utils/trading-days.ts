import { db } from '../../config/database';

// Returns the distinct dates that have at least one OHLCV bar in [start, end].
// Avoids the calendar-vs-actual mismatch (holidays, weekends, exchange closures).
export async function tradingDaysFromOhlcv(
  exchange: string,
  start: string,
  end: string,
): Promise<string[]> {
  const rows = await db('insights.ohlcv_daily')
    .distinct('date')
    .where('exchange', exchange)
    .whereBetween('date', [start, end])
    .orderBy('date', 'asc');
  return rows.map((r: { date: Date }) => toIsoDate(r.date));
}

export function toIsoDate(d: Date | string): string {
  if (typeof d === 'string') return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(ms / 86400000);
}
