import type { Trade } from '@/lib/ml-api';

const reasonColors: Record<Trade['exit_reason'], string> = {
  stop_loss: 'text-red-400',
  take_profit: 'text-green-400',
  max_holding: 'text-gray-400',
  end_of_backtest: 'text-gray-500',
};

export default function TradesTable({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) return null;
  // Show worst→best then truncate. Most informative for ad-hoc review.
  const sorted = [...trades].sort((a, b) => b.return_pct - a.return_pct);
  return (
    <div className="card overflow-hidden p-0">
      <div className="border-b border-gray-800 px-4 py-2 text-sm font-semibold text-gray-300">
        Trades ({trades.length})
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-gray-900 text-gray-400">
            <tr>
              <th className="px-3 py-2 text-left">Symbol</th>
              <th className="px-3 py-2 text-left">Entry</th>
              <th className="px-3 py-2 text-left">Exit</th>
              <th className="px-3 py-2 text-right">Days</th>
              <th className="px-3 py-2 text-right">P&L</th>
              <th className="px-3 py-2 text-right">Return</th>
              <th className="px-3 py-2 text-left">Reason</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t, i) => (
              <tr key={i} className="border-t border-gray-800 hover:bg-gray-800/30">
                <td className="px-3 py-1.5 font-mono">{t.symbol}</td>
                <td className="px-3 py-1.5 text-gray-400">{t.entry_date}</td>
                <td className="px-3 py-1.5 text-gray-400">{t.exit_date}</td>
                <td className="px-3 py-1.5 text-right">{t.holding_days}</td>
                <td className={`px-3 py-1.5 text-right font-mono ${t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {t.pnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </td>
                <td className={`px-3 py-1.5 text-right font-mono ${t.return_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {(t.return_pct * 100).toFixed(2)}%
                </td>
                <td className={`px-3 py-1.5 ${reasonColors[t.exit_reason]}`}>{t.exit_reason.replace('_', ' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
