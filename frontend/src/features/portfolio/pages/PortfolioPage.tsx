import { useEffect } from 'react';
import { usePortfolioStore } from '@/stores/portfolio.store';
import { formatINR, formatPercent } from '@/lib/utils';
import { RefreshCw } from 'lucide-react';

export default function PortfolioPage() {
  const { holdings, totalValue, totalPnl, fetchHoldings, syncFromBroker, isLoading } = usePortfolioStore();

  useEffect(() => {
    fetchHoldings();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Portfolio</h1>
        <button onClick={syncFromBroker} className="btn-secondary" disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Sync from Broker
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm text-gray-400">Total Value</p>
          <p className="mt-1 text-2xl font-bold">{formatINR(totalValue)}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-400">Total P&L</p>
          <p className={`mt-1 text-2xl font-bold ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatINR(totalPnl)}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-400">Stocks Held</p>
          <p className="mt-1 text-2xl font-bold">{holdings.length}</p>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-4 text-lg font-semibold">All Holdings</h2>
        {holdings.length === 0 ? (
          <p className="text-gray-500">No holdings found. Connect your broker and sync.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-gray-400">
                  <th className="pb-2">Symbol</th>
                  <th className="pb-2">Exchange</th>
                  <th className="pb-2 text-right">Qty</th>
                  <th className="pb-2 text-right">Avg Price</th>
                  <th className="pb-2 text-right">Current Price</th>
                  <th className="pb-2 text-right">Invested</th>
                  <th className="pb-2 text-right">Current Value</th>
                  <th className="pb-2 text-right">P&L</th>
                  <th className="pb-2 text-right">P&L %</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
                  <tr key={`${h.exchange}-${h.symbol}`} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-2 font-medium">{h.symbol}</td>
                    <td className="py-2 text-gray-400">{h.exchange}</td>
                    <td className="py-2 text-right">{h.quantity}</td>
                    <td className="py-2 text-right">{formatINR(h.avgPrice)}</td>
                    <td className="py-2 text-right">{formatINR(h.currentPrice)}</td>
                    <td className="py-2 text-right">{formatINR(h.avgPrice * h.quantity)}</td>
                    <td className="py-2 text-right">{formatINR(h.currentPrice * h.quantity)}</td>
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
