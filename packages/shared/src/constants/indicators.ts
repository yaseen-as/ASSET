export const INDICATOR_NAMES = [
  'sma_20',
  'sma_50',
  'sma_200',
  'ema_20',
  'ema_50',
  'rsi_14',
  'macd',
] as const;

export type IndicatorName = (typeof INDICATOR_NAMES)[number];

export const DEFAULT_INDICATOR_PARAMS = {
  sma_20: { period: 20 },
  sma_50: { period: 50 },
  sma_200: { period: 200 },
  ema_20: { period: 20 },
  ema_50: { period: 50 },
  rsi_14: { period: 14 },
  macd: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
};
