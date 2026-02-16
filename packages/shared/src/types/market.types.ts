// ─── Market Data Types ───

import { Exchange } from './broker.types';

export interface Quote {
  symbol: string;
  exchange: Exchange;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: string;
}

export interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface HistoricalDataQuery {
  symbol: string;
  exchange: Exchange;
  interval: CandleInterval;
  from: string;
  to: string;
}

export interface HistoricalDataResponse {
  symbol: string;
  exchange: Exchange;
  interval: CandleInterval;
  candles: OHLCV[];
}

export type CandleInterval = '1m' | '5m' | '15m' | '30m' | '1h' | '1d' | '1w';

export interface TechnicalIndicators {
  sma_20?: number;
  sma_50?: number;
  sma_200?: number;
  ema_20?: number;
  ema_50?: number;
  rsi_14?: number;
  macd?: MACDValue;
}

export interface MACDValue {
  macd: number;
  signal: number;
  histogram: number;
}

// WebSocket message types
export type WSClientAction = 'subscribe' | 'unsubscribe';

export interface WSClientMessage {
  action: WSClientAction;
  symbols: string[]; // Format: "NSE:RELIANCE"
}

export type WSServerMessageType = 'tick' | 'alert_triggered' | 'notification' | 'error';

export interface WSTickData {
  symbol: string;
  exchange: Exchange;
  ltp: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: number;
}

export interface WSServerMessage {
  type: WSServerMessageType;
  data: WSTickData | Record<string, unknown>;
}
