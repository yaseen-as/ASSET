import { useEffect, useRef, useState, useCallback } from 'react';
import api from '@/lib/api';

export interface Tick {
  symbol: string;
  exchange: string;
  ltp: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: number;
}

// Format: 'NSE:RELIANCE'
export type SymbolKey = string;

/**
 * Subscribes to live market ticks for the given symbols.
 *
 * Strategy:
 *  1. Tries to connect to the market-data WebSocket server (VITE_WS_URL or ws://localhost:3014).
 *  2. On success: receives real-time ticks via WS.
 *  3. On failure / disconnect: falls back to polling REST /market/quote every 3 s.
 *
 * For k3d dev: run `kubectl port-forward svc/market-data-service 3014:3014` to enable WS.
 * Otherwise REST polling works automatically.
 *
 * @param symbols - Array of 'EXCHANGE:SYMBOL' strings e.g. ['NSE:RELIANCE', 'NSE:INFY']
 */
export function useMarketTicks(symbols: string[]) {
  const [ticks, setTicks] = useState<Record<SymbolKey, Tick>>({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const usingWs = useRef(false);

  const updateTick = useCallback((tick: Tick) => {
    const key: SymbolKey = `${tick.exchange}:${tick.symbol}`;
    setTicks((prev) => ({ ...prev, [key]: tick }));
  }, []);

  // REST polling fallback: fetch quotes one by one
  const startPolling = useCallback(() => {
    if (pollRef.current || symbols.length === 0) return;
    pollRef.current = setInterval(async () => {
      for (const sym of symbols) {
        const [exchange, symbol] = sym.split(':');
        if (!exchange || !symbol) continue;
        try {
          const { data } = await api.get(`/market/quote/${exchange}/${symbol}`);
          const q = data.data;
          if (q) {
            updateTick({
              symbol: q.symbol,
              exchange: q.exchange,
              ltp: q.ltp,
              change: q.ltp - q.close,
              changePercent: q.close > 0 ? ((q.ltp - q.close) / q.close) * 100 : 0,
              volume: q.volume,
              timestamp: new Date(q.timestamp).getTime(),
            });
          }
        } catch {
          // ignore individual quote failures
        }
      }
    }, 3000);
  }, [symbols, updateTick]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (symbols.length === 0) return;

    const wsUrl = (import.meta.env.VITE_WS_URL as string | undefined) ?? 'ws://localhost:3014';

    let ws: WebSocket;
    let connectTimeout: ReturnType<typeof setTimeout>;

    const tryConnect = () => {
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        // If WS doesn't open within 3 s, start polling
        connectTimeout = setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            ws.close();
            usingWs.current = false;
            setConnected(false);
            startPolling();
          }
        }, 3000);

        ws.onopen = () => {
          clearTimeout(connectTimeout);
          usingWs.current = true;
          setConnected(true);
          stopPolling(); // cancel polling if previously active
          ws.send(JSON.stringify({ action: 'subscribe', symbols }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string);
            if (msg.type === 'tick' && msg.data) {
              updateTick(msg.data as Tick);
            }
          } catch {
            // ignore parse errors
          }
        };

        ws.onerror = () => {
          // error handling via onclose
        };

        ws.onclose = () => {
          clearTimeout(connectTimeout);
          usingWs.current = false;
          setConnected(false);
          // Fall back to polling
          startPolling();
        };
      } catch {
        usingWs.current = false;
        setConnected(false);
        startPolling();
      }
    };

    tryConnect();

    return () => {
      clearTimeout(connectTimeout);
      stopPolling();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [symbols.join(',')]); // re-run only when symbol list changes

  // If symbols change while WS is open, re-subscribe
  useEffect(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN && symbols.length > 0) {
      ws.send(JSON.stringify({ action: 'subscribe', symbols }));
    }
  }, [symbols]);

  return { ticks, connected };
}
