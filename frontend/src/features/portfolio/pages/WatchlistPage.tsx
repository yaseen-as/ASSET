import { useEffect, useState } from 'react';
import { usePortfolioStore } from '@/stores/portfolio.store';
import { formatINR, formatPercent } from '@/lib/utils';
import { Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function WatchlistPage() {
  const { watchlists, fetchWatchlists, addToWatchlist, removeFromWatchlist, isLoading } = usePortfolioStore();
  const [symbol, setSymbol] = useState('');
  const [exchange, setExchange] = useState('NSE');

  useEffect(() => {
    fetchWatchlists();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol.trim()) return;
    try {
      await addToWatchlist(symbol.trim().toUpperCase(), exchange);
      setSymbol('');
      toast.success(`${symbol.toUpperCase()} added to watchlist`);
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to add');
    }
  };

  const handleRemove = async (id: string, sym: string) => {
    try {
      await removeFromWatchlist(id);
      toast.success(`${sym} removed`);
    } catch {
      toast.error('Failed to remove');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Watchlist</h1>

      <form onSubmit={handleAdd} className="card flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="label">Symbol</label>
          <input
            className="input"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="e.g. RELIANCE"
            required
          />
        </div>
        <div className="w-32">
          <label className="label">Exchange</label>
          <select className="input" value={exchange} onChange={(e) => setExchange(e.target.value)}>
            <option value="NSE">NSE</option>
            <option value="BSE">BSE</option>
          </select>
        </div>
        <button type="submit" className="btn-primary" disabled={isLoading}>
          <Plus className="mr-1 h-4 w-4" /> Add
        </button>
      </form>

      <div className="card">
        {watchlists.length === 0 ? (
          <p className="text-gray-500">Your watchlist is empty. Add symbols above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-gray-400">
                  <th className="pb-2">Symbol</th>
                  <th className="pb-2">Exchange</th>
                  <th className="pb-2 text-right">LTP</th>
                  <th className="pb-2 text-right">Change</th>
                  <th className="pb-2 text-right">Change %</th>
                  <th className="pb-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {watchlists.map((w) => (
                  <tr key={w.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-2 font-medium">{w.symbol}</td>
                    <td className="py-2 text-gray-400">{w.exchange}</td>
                    <td className="py-2 text-right">{formatINR(w.ltp)}</td>
                    <td className={`py-2 text-right ${w.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {w.change >= 0 ? '+' : ''}{w.change.toFixed(2)}
                    </td>
                    <td className={`py-2 text-right ${w.changePct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatPercent(w.changePct)}
                    </td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => handleRemove(w.id, w.symbol)}
                        className="text-gray-500 hover:text-red-400"
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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
