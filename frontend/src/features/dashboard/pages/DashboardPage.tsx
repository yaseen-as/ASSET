import { useEffect } from 'react';
import { usePortfolioStore } from '@/stores/portfolio.store';
import { useNotificationStore } from '@/stores/notification.store';
import { useAnalyticsStore } from '@/stores/analytics.store';
import { useMarketTicks } from '@/hooks/useMarketTicks';
import { formatINR, formatPercent } from '@/lib/utils';
import { TrendingUp, TrendingDown, Briefcase, Bell, Activity, BarChart3, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

// Top 5 symbols to show in the dashboard ticker
const DASHBOARD_SYMBOLS = [
  'NSE:RELIANCE',
  'NSE:INFY',
  'NSE:TCS',
  'NSE:HDFCBANK',
  'NSE:SBIN',
];

export default function DashboardPage() {
  const { holdings, totalValue, totalPnl, fetchHoldings, isLoading } = usePortfolioStore();
  const { unreadCount, fetch: fetchNotifications } = useNotificationStore();
  const { summary, fetchSummary } = useAnalyticsStore();
  const { ticks } = useMarketTicks(DASHBOARD_SYMBOLS);

  useEffect(() => {
    fetchHoldings();
    fetchNotifications();
    fetchSummary();
  }, []);

  const totalPnlPct = totalValue > 0 ? (totalPnl / (totalValue - totalPnl)) * 100 : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Live market mini-ticker */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        {DASHBOARD_SYMBOLS.map((sym) => {
          const tick = ticks[sym];
          const symbol = sym.split(':')[1];
          const isUp = (tick?.changePercent ?? 0) >= 0;
          return (
            <Link
              key={sym}
              to="/market"
              className="card flex min-w-[140px] flex-col gap-0.5 p-3 transition-colors hover:border-gray-700 shrink-0"
            >
              <span className="text-xs font-semibold text-gray-300">{symbol}</span>
              {tick ? (
                <>
                  <span className="font-mono text-sm font-bold">{formatINR(tick.ltp)}</span>
                  <span className={cn('flex items-center gap-0.5 text-xs', isUp ? 'text-green-400' : 'text-red-400')}>
                    {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {formatPercent(tick.changePercent)}
                  </span>
                </>
              ) : (
                <span className="text-xs text-gray-600">Loading…</span>
              )}
            </Link>
          );
        })}
        <Link
          to="/market"
          className="card flex min-w-[100px] shrink-0 items-center justify-center gap-1 p-3 text-xs text-gray-500 transition-colors hover:border-gray-700 hover:text-gray-300"
        >
          <Activity className="h-4 w-4" />
          View All
        </Link>
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

      {/* Analytics Quick View */}
      {summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link to="/analytics" className="card transition-colors hover:border-gray-700">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Shield className="h-4 w-4" /> Diversification Score
            </div>
            <p className="mt-2 text-2xl font-bold">{summary.diversificationScore}/100</p>
            <p className="text-sm text-gray-500">{summary.sectorCount} sectors</p>
          </Link>
          <Link to="/analytics" className="card transition-colors hover:border-gray-700">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <BarChart3 className="h-4 w-4" /> Day Change
            </div>
            <p className={`mt-2 text-2xl font-bold ${summary.dayChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatINR(summary.dayChange)}
            </p>
            <p className={`text-sm ${summary.dayChangePct >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {formatPercent(summary.dayChangePct)}
            </p>
          </Link>
          <Link to="/analytics" className="card transition-colors hover:border-gray-700">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              {summary.topGainers.length > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              Top Mover
            </div>
            {summary.topGainers[0] ? (
              <>
                <p className="mt-2 text-2xl font-bold text-green-400">{summary.topGainers[0].symbol}</p>
                <p className="text-sm text-green-500">+{summary.topGainers[0].pnlPercent.toFixed(2)}%</p>
              </>
            ) : summary.topLosers[0] ? (
              <>
                <p className="mt-2 text-2xl font-bold text-red-400">{summary.topLosers[0].symbol}</p>
                <p className="text-sm text-red-500">{summary.topLosers[0].pnlPercent.toFixed(2)}%</p>
              </>
            ) : (
              <p className="mt-2 text-gray-500">No data</p>
            )}
          </Link>
        </div>
      )}

      {/* Top Holdings */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Top Holdings</h2>
          <Link to="/portfolio" className="text-sm text-brand-400 hover:text-brand-300">
            View all →
          </Link>
        </div>
        {isLoading ? (
          <p className="text-gray-500">Loading…</p>
        ) : holdings.length === 0 ? (
          <div className="space-y-2 py-4 text-center text-gray-500">
            <p>No holdings yet. Connect your broker to sync.</p>
            <Link to="/broker" className="text-sm text-brand-400 hover:text-brand-300">
              Connect broker →
            </Link>
          </div>
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
                {holdings.slice(0, 10).map((h) => {
                  // Use live tick if available, otherwise fall back to stored price
                  const liveTick = ticks[`${h.exchange}:${h.symbol}`];
                  const ltp = liveTick?.ltp ?? h.currentPrice;
                  const livePnl = (ltp - h.avgPrice) * h.quantity;
                  const livePnlPct = h.avgPrice > 0 ? ((ltp - h.avgPrice) / h.avgPrice) * 100 : 0;

                  return (
                    <tr key={`${h.exchange}-${h.symbol}`} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-2 font-medium">
                        {h.symbol}
                        <span className="ml-1.5 text-xs text-gray-500">{h.exchange}</span>
                      </td>
                      <td className="py-2 text-right">{h.quantity}</td>
                      <td className="py-2 text-right">{formatINR(h.avgPrice)}</td>
                      <td className="py-2 text-right font-mono">{formatINR(ltp)}</td>
                      <td className={`py-2 text-right font-medium ${livePnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatINR(livePnl)}
                      </td>
                      <td className={`py-2 text-right ${livePnlPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatPercent(livePnlPct)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
