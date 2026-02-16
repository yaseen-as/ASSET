import { useEffect, useState } from 'react';
import { usePortfolioStore } from '@/stores/portfolio.store';
import { useNotificationStore } from '@/stores/notification.store';
import { formatINR, formatPercent, formatCompact } from '@/lib/utils';
import { TrendingUp, TrendingDown, Briefcase, Bell } from 'lucide-react';
import api from '@/lib/api';

interface MarketIndex {
  name: string;
  value: number;
  change: number;
  changePct: number;
}

export default function DashboardPage() {
  const { holdings, totalValue, totalPnl, fetchHoldings, isLoading } = usePortfolioStore();
  const { unreadCount, fetch: fetchNotifications } = useNotificationStore();
  const [indices, setIndices] = useState<MarketIndex[]>([]);

  useEffect(() => {
    fetchHoldings();
    fetchNotifications();

    // Fetch market indices (mock data for now)
    setIndices([
      { name: 'NIFTY 50', value: 23450.5, change: 125.3, changePct: 0.54 },
      { name: 'SENSEX', value: 77230.8, change: 410.2, changePct: 0.53 },
      { name: 'BANK NIFTY', value: 49780.0, change: -85.4, changePct: -0.17 },
    ]);
  }, []);

  const totalPnlPct = totalValue > 0 ? (totalPnl / (totalValue - totalPnl)) * 100 : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Market Indices */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {indices.map((idx) => (
          <div key={idx.name} className="card">
            <p className="text-sm text-gray-400">{idx.name}</p>
            <p className="mt-1 text-2xl font-bold">{idx.value.toLocaleString('en-IN')}</p>
            <p className={`mt-1 flex items-center gap-1 text-sm ${idx.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {idx.change >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {idx.change >= 0 ? '+' : ''}{idx.change.toFixed(1)} ({formatPercent(idx.changePct)})
            </p>
          </div>
        ))}
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Briefcase className="h-4 w-4" /> Portfolio Value
          </div>
          <p className="mt-2 text-2xl font-bold">{formatINR(totalValue)}</p>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            {totalPnl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            Total P&L
          </div>
          <p className={`mt-2 text-2xl font-bold ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatINR(totalPnl)}
          </p>
          <p className={`text-sm ${totalPnlPct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {formatPercent(totalPnlPct)}
          </p>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            Holdings
          </div>
          <p className="mt-2 text-2xl font-bold">{holdings.length}</p>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Bell className="h-4 w-4" /> Unread Alerts
          </div>
          <p className="mt-2 text-2xl font-bold">{unreadCount}</p>
        </div>
      </div>

      {/* Top Holdings */}
      <div className="card">
        <h2 className="mb-4 text-lg font-semibold">Top Holdings</h2>
        {isLoading ? (
          <p className="text-gray-500">Loading…</p>
        ) : holdings.length === 0 ? (
          <p className="text-gray-500">No holdings yet. Connect your broker to sync.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-gray-400">
                  <th className="pb-2">Symbol</th>
                  <th className="pb-2 text-right">Qty</th>
                  <th className="pb-2 text-right">Avg Price</th>
                  <th className="pb-2 text-right">LTP</th>
                  <th className="pb-2 text-right">P&L</th>
                  <th className="pb-2 text-right">P&L %</th>
                </tr>
              </thead>
              <tbody>
                {holdings.slice(0, 10).map((h) => (
                  <tr key={h.symbol} className="border-b border-gray-800/50">
                    <td className="py-2 font-medium">{h.symbol}</td>
                    <td className="py-2 text-right">{h.quantity}</td>
                    <td className="py-2 text-right">{formatINR(h.avgPrice)}</td>
                    <td className="py-2 text-right">{formatINR(h.currentPrice)}</td>
                    <td className={`py-2 text-right font-medium ${h.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatINR(h.pnl)}
                    </td>
                    <td className={`py-2 text-right ${h.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatPercent(h.pnlPercent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
