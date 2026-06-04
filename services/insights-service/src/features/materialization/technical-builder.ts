import { db } from '../../config/database';
import { RSI, MACD, SMA, EMA, ATR } from 'technicalindicators';
import type { FeatureVector } from '../types';

// Same feature set produced by ml/pipelines/technical/transform.py.
// MUST stay byte-equivalent — model trained on Python features expects the
// same column order and value semantics. Tests should diff against Python.
export const TECHNICAL_FEATURE_COLS = [
  'rsi_14',
  'macd', 'macd_signal', 'macd_hist',
  'sma_20', 'sma_50',
  'ema_12', 'ema_26',
  'ret_5d', 'ret_10d', 'ret_20d',
  'volatility_20d',
  'atr_14',
  'volume_zscore_20d',
  'close_to_sma20', 'close_to_sma50',
] as const;

interface Bar { symbol: string; date: string; close: number; high: number; low: number; volume: number; }

function pctChange(arr: number[], n: number): number | null {
  if (arr.length <= n) return null;
  const cur = arr[arr.length - 1];
  const past = arr[arr.length - 1 - n];
  if (!past) return null;
  return cur / past - 1;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = arr.reduce((s, x) => s + x, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
}

function zscoreLast(arr: number[]): number | null {
  if (arr.length < 20) return null;
  const window = arr.slice(-20);
  const m = window.reduce((s, x) => s + x, 0) / window.length;
  const s = std(window);
  return s === 0 ? null : (window[window.length - 1] - m) / s;
}

function lastOrNull(arr: number[]): number | null {
  return arr.length === 0 ? null : arr[arr.length - 1];
}

export async function buildTechnicalFor(exchange: string, asOfDate: string, lookbackDays = 250): Promise<FeatureVector[]> {
  // Pull bars dated <= as_of_date for all symbols. Lookback caps how far back
  // we read; 250d covers MACD slow EMA + SMA50 + ret_20d comfortably.
  const start = new Date(asOfDate);
  start.setDate(start.getDate() - lookbackDays);
  const startIso = start.toISOString().slice(0, 10);

  const rows = (await db('insights.ohlcv_daily')
    .select('symbol', 'date', 'close', 'high', 'low', 'volume')
    .where('exchange', exchange)
    .whereBetween('date', [startIso, asOfDate])
    .orderBy('symbol', 'asc')
    .orderBy('date', 'asc')) as Array<{ symbol: string; date: Date; close: string; high: string; low: string; volume: string }>;

  const bySymbol = new Map<string, Bar[]>();
  for (const r of rows) {
    const arr = bySymbol.get(r.symbol) ?? [];
    arr.push({
      symbol: r.symbol,
      date: r.date.toISOString().slice(0, 10),
      close: Number(r.close), high: Number(r.high), low: Number(r.low), volume: Number(r.volume),
    });
    bySymbol.set(r.symbol, arr);
  }

  const out: FeatureVector[] = [];
  for (const [symbol, bars] of bySymbol) {
    // Last bar must be exactly as_of_date — otherwise the symbol didn't trade today.
    if (bars[bars.length - 1].date !== asOfDate) continue;

    const closes = bars.map((b) => b.close);
    const highs = bars.map((b) => b.high);
    const lows = bars.map((b) => b.low);
    const vols = bars.map((b) => b.volume);

    const rsi14 = lastOrNull(RSI.calculate({ period: 14, values: closes }));
    const macd = MACD.calculate({
      values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9,
      SimpleMAOscillator: false, SimpleMASignal: false,
    });
    const macdLast = macd[macd.length - 1];

    const sma20 = lastOrNull(SMA.calculate({ period: 20, values: closes }));
    const sma50 = lastOrNull(SMA.calculate({ period: 50, values: closes }));
    const ema12 = lastOrNull(EMA.calculate({ period: 12, values: closes }));
    const ema26 = lastOrNull(EMA.calculate({ period: 26, values: closes }));

    const ret5 = pctChange(closes, 5);
    const ret10 = pctChange(closes, 10);
    const ret20 = pctChange(closes, 20);

    // 20-day rolling std of daily returns
    const dailyRets: number[] = [];
    for (let i = 1; i < closes.length; i++) dailyRets.push(closes[i] / closes[i - 1] - 1);
    const vol20 = dailyRets.length >= 20 ? std(dailyRets.slice(-20)) : null;

    const atr14 = lastOrNull(ATR.calculate({ period: 14, high: highs, low: lows, close: closes }));
    const vz = zscoreLast(vols);
    const lastClose = closes[closes.length - 1];

    const features: Record<string, number | null> = {
      rsi_14: rsi14,
      macd: macdLast?.MACD ?? null,
      macd_signal: macdLast?.signal ?? null,
      macd_hist: macdLast?.histogram ?? null,
      sma_20: sma20,
      sma_50: sma50,
      ema_12: ema12,
      ema_26: ema26,
      ret_5d: ret5,
      ret_10d: ret10,
      ret_20d: ret20,
      volatility_20d: vol20,
      atr_14: atr14,
      volume_zscore_20d: vz,
      close_to_sma20: sma20 ? lastClose / sma20 - 1 : null,
      close_to_sma50: sma50 ? lastClose / sma50 - 1 : null,
    };

    // Drop rows with any null feature — same policy as labels.py join.
    if (Object.values(features).some((v) => v === null || Number.isNaN(v))) continue;

    out.push({
      symbol,
      exchange,
      as_of_date: asOfDate,
      feature_set: 'technical_v1',
      features: features as Record<string, number>,
    });
  }
  return out;
}
