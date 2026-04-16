import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

const BASE_URL = config.upstox.apiUrl;
const TIMEOUT = 8000;

function authHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

// ─── Holdings ─────────────────────────────────────────────────────────────────

export interface UpstoxHolding {
  isin: string;
  cnc_used_quantity: number;
  company_name: string;
  exchange: string;
  quantity: number;
  average_price: number;
  last_price: number;
  pnl: number;
  instrument_token: string;
  trading_symbol: string;
}

export async function getHoldings(accessToken: string): Promise<UpstoxHolding[]> {
  const { data } = await axios.get(`${BASE_URL}/portfolio/long-term-holdings`, {
    headers: authHeaders(accessToken),
    timeout: TIMEOUT,
  });
  return data.data || [];
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export interface UpstoxOrderParams {
  instrument_token: string;
  quantity: number;
  product: 'D' | 'I' | 'CO' | 'OCO';
  validity: 'DAY' | 'IOC';
  price: number;
  order_type: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  transaction_type: 'BUY' | 'SELL';
  disclosed_quantity?: number;
  trigger_price?: number;
  is_amo?: boolean;
}

export async function placeOrder(accessToken: string, order: UpstoxOrderParams): Promise<{ orderId: string }> {
  const { data } = await axios.post(`${BASE_URL}/order/place`, order, {
    headers: authHeaders(accessToken),
    timeout: TIMEOUT,
  });
  return { orderId: data.data?.order_id || '' };
}

export async function getOrderBook(accessToken: string): Promise<any[]> {
  const { data } = await axios.get(`${BASE_URL}/order/retrieve-all`, {
    headers: authHeaders(accessToken),
    timeout: TIMEOUT,
  });
  return data.data || [];
}

export async function cancelOrder(accessToken: string, orderId: string): Promise<{ orderId: string }> {
  const { data } = await axios.delete(`${BASE_URL}/order/cancel`, {
    headers: authHeaders(accessToken),
    params: { order_id: orderId },
    timeout: TIMEOUT,
  });
  return { orderId: data.data?.order_id || orderId };
}

// ─── Market Quotes ────────────────────────────────────────────────────────────

export interface UpstoxQuote {
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function getQuote(
  accessToken: string,
  instrumentKey: string,
): Promise<UpstoxQuote> {
  const { data } = await axios.get(`${BASE_URL}/market-quote/quotes`, {
    headers: authHeaders(accessToken),
    params: { symbol: instrumentKey },
    timeout: TIMEOUT,
  });

  const quotes = data.data || {};
  const quoteData = Object.values(quotes)[0] as any;
  if (!quoteData) {
    throw new Error(`No quote data for ${instrumentKey}`);
  }

  return {
    ltp: quoteData.last_price || 0,
    open: quoteData.ohlc?.open || 0,
    high: quoteData.ohlc?.high || 0,
    low: quoteData.ohlc?.low || 0,
    close: quoteData.ohlc?.close || 0,
    volume: quoteData.volume || 0,
  };
}

export async function getLtp(
  accessToken: string,
  instrumentKey: string,
): Promise<number> {
  const { data } = await axios.get(`${BASE_URL}/market-quote/ltp`, {
    headers: authHeaders(accessToken),
    params: { symbol: instrumentKey },
    timeout: TIMEOUT,
  });

  const quotes = data.data || {};
  const quoteData = Object.values(quotes)[0] as any;
  return quoteData?.last_price || 0;
}

// ─── Historical Candles ───────────────────────────────────────────────────────

export interface UpstoxCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function getHistoricalCandles(
  accessToken: string,
  instrumentKey: string,
  interval: string,
  toDate: string,
  fromDate: string,
): Promise<UpstoxCandle[]> {
  const encodedKey = encodeURIComponent(instrumentKey);
  const { data } = await axios.get(
    `${BASE_URL}/historical-candle/${encodedKey}/${interval}/${toDate}/${fromDate}`,
    { headers: authHeaders(accessToken), timeout: TIMEOUT },
  );

  const candles: number[][] = data.data?.candles || [];
  return candles.map((c) => ({
    date: c[0] as unknown as string,
    open: c[1],
    high: c[2],
    low: c[3],
    close: c[4],
    volume: c[5],
  }));
}

// ─── User Profile ─────────────────────────────────────────────────────────────

export async function getUserProfile(accessToken: string): Promise<{ userId: string; email: string; name: string }> {
  const { data } = await axios.get(`${BASE_URL}/user/profile`, {
    headers: authHeaders(accessToken),
    timeout: TIMEOUT,
  });
  const profile = data.data || {};
  return {
    userId: profile.user_id || '',
    email: profile.email || '',
    name: profile.user_name || '',
  };
}
