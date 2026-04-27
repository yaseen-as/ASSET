import { useState, useCallback } from 'react';
import api from '@/lib/api';
import { usePolling } from '@/hooks/usePolling';

export interface Tick {
  symbol: string;
  exchange: string;
  ltp: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: number;
}

export type SymbolKey = string;

export function useQuotes(symbols: string[], intervalMs = 5000) {
  const [ticks, setTicks] = useState<Record<SymbolKey, Tick>>({});
  const key = symbols.join(',');

  const fetchAll = useCallback(async () => {
    if (symbols.length === 0) return;
    const results = await Promise.allSettled(
      symbols.map(async (sym) => {
        const [exchange, symbol] = sym.split(':');
        if (!exchange || !symbol) return null;
        const { data } = await api.get(`/market/quote/${exchange}/${symbol}`);
        const q = data.data;
        if (!q) return null;
        const tick: Tick = {
          symbol: q.symbol,
          exchange: q.exchange,
          ltp: q.ltp,
          change: q.ltp - q.close,
          changePercent: q.close > 0 ? ((q.ltp - q.close) / q.close) * 100 : 0,
          volume: q.volume,
          timestamp: new Date(q.timestamp).getTime(),
        };
        return [`${tick.exchange}:${tick.symbol}`, tick] as const;
      }),
    );

    setTicks((prev) => {
      const next = { ...prev };
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          const [k, v] = r.value;
          next[k] = v;
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  usePolling(fetchAll, intervalMs, { enabled: symbols.length > 0 });

  return { ticks };
}
