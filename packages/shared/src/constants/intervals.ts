export const CANDLE_INTERVALS = ['1m', '5m', '15m', '30m', '1h', '1d', '1w'] as const;

export const INTERVAL_SECONDS: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '1d': 86400,
  '1w': 604800,
};
