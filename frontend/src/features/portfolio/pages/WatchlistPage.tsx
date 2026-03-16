import { useEffect, useState } from 'react';
import { usePortfolioStore } from '@/stores/portfolio.store';
import type { Watchlist } from '@/stores/portfolio.store';
import { Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function WatchlistPage() {
  const {
    watchlists,
    fetchWatchlists,
    createWatchlist,
    addSymbolToWatchlist,
    removeSymbolFromWatchlist,
    deleteWatchlist,
    isLoading,
  } = usePortfolioStore();

  // New watchlist form
  const [newName, setNewName] = useState('');

  // Add-symbol form: tracked per watchlist id
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newSymbol, setNewSymbol] = useState('');
  const [newExchange, setNewExchange] = useState('NSE');

  useEffect(() => {
    fetchWatchlists();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await createWatchlist(newName.trim(), []);
      setNewName('');
      toast.success(`Watchlist "${newName.trim()}" created`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to create watchlist');
    }
  };

  const handleAddSymbol = async (e: React.FormEvent, watchlistId: string) => {
    e.preventDefault();
    if (!newSymbol.trim()) return;
    try {
      await addSymbolToWatchlist(watchlistId, newSymbol.trim().toUpperCase(), newExchange);
      setNewSymbol('');
      setAddingTo(null);
      toast.success(`${newSymbol.toUpperCase()} added`);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to add symbol');
    }
  };

  const handleRemoveSymbol = async (watchlistId: string, symbol: string) => {
    try {
      await removeSymbolFromWatchlist(watchlistId, symbol);
      toast.success(`${symbol} removed`);
    } catch {
      toast.error('Failed to remove symbol');
    }
  };

  const handleDeleteWatchlist = async (id: string, name: string) => {
    try {
      await deleteWatchlist(id);
      toast.success(`"${name}" deleted`);
    } catch {
      toast.error('Failed to delete watchlist');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Watchlists</h1>

      {/* Create new watchlist */}
      <form onSubmit={handleCreate} className="card flex gap-3 items-end">
        <div className="flex-1">
          <label className="label">New Watchlist Name</label>
          <input
            className="input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Tech Stocks"
            required
          />
        </div>
        <button type="submit" className="btn-primary" disabled={isLoading}>
          <Plus className="mr-1 h-4 w-4" /> Create
        </button>
      </form>

      {/* Watchlist cards */}
      {isLoading && watchlists.length === 0 ? (
        <p className="text-gray-500">Loading...</p>
      ) : watchlists.length === 0 ? (
        <div className="card text-gray-500">No watchlists yet. Create one above.</div>
      ) : (
        <div className="space-y-4">
          {watchlists.map((wl: Watchlist) => (
            <div key={wl.id} className="card space-y-3">
              {/* Watchlist header */}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{wl.name}</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setAddingTo(addingTo === wl.id ? null : wl.id);
                      setNewSymbol('');
                    }}
                    className="btn-secondary text-sm flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Symbol
                  </button>
                  <button
                    onClick={() => handleDeleteWatchlist(wl.id, wl.name)}
                    className="text-gray-500 hover:text-red-400"
                    title="Delete watchlist"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Add symbol inline form */}
              {addingTo === wl.id && (
                <form
                  onSubmit={(e) => handleAddSymbol(e, wl.id)}
                  className="flex gap-2 items-end border-t border-gray-800 pt-3"
                >
                  <div className="flex-1">
                    <input
                      className="input"
                      value={newSymbol}
                      onChange={(e) => setNewSymbol(e.target.value)}
                      placeholder="Symbol e.g. RELIANCE"
                      autoFocus
                      required
                    />
                  </div>
                  <div className="w-28">
                    <select
                      className="input"
                      value={newExchange}
                      onChange={(e) => setNewExchange(e.target.value)}
                    >
                      <option value="NSE">NSE</option>
                      <option value="BSE">BSE</option>
                    </select>
                  </div>
                  <button type="submit" className="btn-primary text-sm">Add</button>
                  <button
                    type="button"
                    className="text-gray-500 hover:text-white"
                    onClick={() => setAddingTo(null)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </form>
              )}

              {/* Symbols list */}
              {wl.symbols.length === 0 ? (
                <p className="text-sm text-gray-500">No symbols yet. Click "Add Symbol" to add some.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {wl.symbols.map((s) => (
                    <div
                      key={`${s.symbol}-${s.exchange}`}
                      className="flex items-center gap-1.5 rounded-full bg-gray-800 px-3 py-1 text-sm"
                    >
                      <span className="font-medium">{s.symbol}</span>
                      <span className="text-gray-400 text-xs">{s.exchange}</span>
                      <button
                        onClick={() => handleRemoveSymbol(wl.id, s.symbol)}
                        className="ml-1 text-gray-500 hover:text-red-400"
                        title={`Remove ${s.symbol}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
