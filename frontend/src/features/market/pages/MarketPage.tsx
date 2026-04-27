import { useState } from 'react';
import { useQuotes } from '@/hooks/useQuotes';
import { formatINR, formatPercent } from '@/lib/utils';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

// The 10 tracked symbols from the Phase 1 plan
const TRACKED_SYMBOLS = [
  'NSE:RELIANCE',
  'NSE:INFY',
  'NSE:SBIN',
  'NSE:TCS',
  'NSE:HDFCBANK',
  'NSE:ICICIBANK',
  'NSE:KOTAKBANK',
  'NSE:LT',
  'NSE:AXISBANK',
  'NSE:WIPRO',
];

export default function MarketPage() {
  const { ticks } = useQuotes(TRACKED_SYMBOLS, 5000);

  // Flash state: track which symbols just changed price
  const [flashMap, setFlashMap] = useState<Record<string, 'up' | 'down' | null>>({});

  // We track previous LTPs to detect changes and apply flash
  const prevLtpRef = useState<Record<string, number>>({})[0];

  const tickList = TRACKED_SYMBOLS.map((sym) => {
    const tick = ticks[sym];
    const [exchange, symbol] = sym.split(':');
    return { sym, exchange, symbol, tick };
  });

  // Detect price direction for flash effect
  tickList.forEach(({ sym, tick }) => {
    if (!tick) return;
    const prev = prevLtpRef[sym];
    if (prev !== undefined && prev !== tick.ltp) {
      const dir = tick.ltp > prev ? 'up' : 'down';
      setFlashMap((f) => ({ ...f, [sym]: dir }));
      prevLtpRef[sym] = tick.ltp;
      setTimeout(() => setFlashMap((f) => ({ ...f, [sym]: null })), 600);
    } else if (prev === undefined) {
      prevLtpRef[sym] = tick.ltp;
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Activity className="h-6 w-6 text-brand-400" />
        <h1 className="text-2xl font-bold">Market</h1>
      </div>

      <p className="text-sm text-gray-500">
        Quotes refresh every 5 seconds while this tab is visible.
      </p>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-400">
              <th className="pb-3 pr-4">Symbol</th>
              <th className="pb-3 text-right">LTP</th>
              <th className="pb-3 text-right">Change</th>
              <th className="pb-3 text-right">Change %</th>
              <th className="pb-3 text-right">Volume</th>
              <th className="pb-3 text-center">Signal</th>
            </tr>
          </thead>
          <tbody>
            {tickList.map(({ sym, exchange, symbol, tick }) => {
              const flash = flashMap[sym];
              const isUp = (tick?.changePercent ?? 0) >= 0;

              return (
                <tr
                  key={sym}
                  className={cn(
                    'border-b border-gray-800/50 transition-colors duration-300',
                    flash === 'up' && 'bg-green-900/20',
                    flash === 'down' && 'bg-red-900/20',
                    !flash && 'hover:bg-gray-800/30',
                  )}
                >
                  <td className="py-3 pr-4">
                    <span className="font-semibold">{symbol}</span>
                    <span className="ml-2 text-xs text-gray-500">{exchange}</span>
                  </td>
                  <td className="py-3 text-right font-mono font-medium">
                    {tick ? formatINR(tick.ltp) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className={cn('py-3 text-right font-mono', tick ? (isUp ? 'text-green-400' : 'text-red-400') : 'text-gray-600')}>
                    {tick ? (
                      <>
                        {isUp ? '+' : ''}
                        {tick.change.toFixed(2)}
                      </>
                    ) : '—'}
                  </td>
                  <td className={cn('py-3 text-right', tick ? (isUp ? 'text-green-400' : 'text-red-400') : 'text-gray-600')}>
                    {tick ? (
                      <span className="flex items-center justify-end gap-1">
                        {isUp
                          ? <TrendingUp className="h-3.5 w-3.5" />
                          : <TrendingDown className="h-3.5 w-3.5" />}
                        {formatPercent(tick.changePercent)}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-3 text-right font-mono text-gray-400">
                    {tick ? tick.volume.toLocaleString('en-IN') : '—'}
                  </td>
                  <td className="py-3 text-center">
                    {tick ? (
                      <span className={cn(
                        'badge',
                        isUp ? 'badge-green' : 'badge-red',
                      )}>
                        {isUp ? 'Bullish' : 'Bearish'}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-600">Loading…</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-600">
        Tracked symbols: {TRACKED_SYMBOLS.map((s) => s.split(':')[1]).join(', ')}.
        Signals are generated from Phase 1 rule engine after market close.
      </p>
    </div>
  );
}
