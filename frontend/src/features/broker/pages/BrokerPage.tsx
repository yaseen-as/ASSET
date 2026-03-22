import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { usePortfolioStore } from '@/stores/portfolio.store';
import { useMarketTicks } from '@/hooks/useMarketTicks';
import { formatINR, formatPercent } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  Link2,
  Unplug,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Activity,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface BrokerConnection {
  id: string;
  brokerName?: string;
  broker_name?: string;
  clientId?: string;
  client_id?: string;
  isActive?: boolean;
  is_active?: boolean;
  connectedAt?: string;
  connected_at?: string;
}

// Show live prices for user's holdings after broker sync
const QUICK_SYMBOLS = [
  'NSE:RELIANCE',
  'NSE:INFY',
  'NSE:TCS',
  'NSE:HDFCBANK',
  'NSE:SBIN',
];

export default function BrokerPage() {
  const [connections, setConnections] = useState<BrokerConnection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const { holdings, fetchHoldings } = usePortfolioStore();

  // Build symbol list from holdings for live tracking
  const holdingSymbols = holdings.length > 0
    ? holdings.slice(0, 10).map((h) => `${h.exchange}:${h.symbol}`)
    : QUICK_SYMBOLS;
  const { ticks, connected: wsConnected } = useMarketTicks(holdingSymbols);

  // Connect form
  const [clientId, setClientId] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [apiKey, setApiKey] = useState('');

  const fetchConnections = async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get('/broker/connections');
      setConnections(data.data || []);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
    fetchHoldings();
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/broker/connect', {
        brokerName: 'angel_one',
        clientId,
        password,
        totp,
        apiKey,
      });
      toast.success('Broker connected! Syncing holdings…');
      setClientId('');
      setPassword('');
      setTotp('');
      setApiKey('');
      fetchConnections();

      // Auto-sync holdings after connecting
      handleSync();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || err.response?.data?.message || 'Connection failed');
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const { data } = await api.post('/portfolio/sync');
      const synced = data.data?.synced ?? 0;
      setSyncResult(`Synced ${synced} holding${synced !== 1 ? 's' : ''} from broker`);
      toast.success(`Synced ${synced} holdings`);
      fetchHoldings();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Sync failed');
      setSyncResult(null);
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await api.delete(`/broker/disconnect/${id}`);
      toast.success('Disconnected');
      fetchConnections();
    } catch {
      toast.error('Failed to disconnect');
    }
  };

  const handleToggle = async (id: string, currentState: boolean) => {
    try {
      await api.patch(`/broker/connections/${id}/toggle`, { isActive: !currentState });
      fetchConnections();
    } catch {
      toast.error('Failed to toggle');
    }
  };

  const hasActiveConnection = connections.some((c) => c.isActive ?? c.is_active);
  const getBrokerName = (c: BrokerConnection) => c.brokerName ?? c.broker_name ?? 'Unknown';
  const getClientId = (c: BrokerConnection) => c.clientId ?? c.client_id ?? '****';
  const getIsActive = (c: BrokerConnection) => c.isActive ?? c.is_active ?? false;
  const getConnectedAt = (c: BrokerConnection) => c.connectedAt ?? c.connected_at;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link2 className="h-6 w-6 text-brand-400" />
        <h1 className="text-2xl font-bold">Broker Integration</h1>
      </div>

      {/* Market Data Status */}
      <div className="card flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-brand-400" />
          <div>
            <p className="text-sm font-medium">Market Data Feed</p>
            <p className="text-xs text-gray-500">
              {wsConnected
                ? 'Live WebSocket connection active'
                : 'Polling for market quotes every 3s'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {wsConnected ? (
            <Wifi className="h-4 w-4 text-green-400" />
          ) : (
            <WifiOff className="h-4 w-4 text-yellow-400" />
          )}
          <span className={cn('text-sm font-medium', wsConnected ? 'text-green-400' : 'text-yellow-400')}>
            {wsConnected ? 'Live' : 'Polling'}
          </span>
          <Link to="/market" className="ml-2 text-xs text-brand-400 hover:text-brand-300">
            View Market →
          </Link>
        </div>
      </div>

      {/* Connect Form */}
      {!hasActiveConnection && (
        <form onSubmit={handleConnect} className="card space-y-4">
          <h2 className="text-lg font-semibold">Connect Angel One</h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Client ID</label>
              <input className="input" value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="AB1234" required />
            </div>
            <div>
              <label className="label">API Key</label>
              <input className="input" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Your Angel One API key" required />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div>
              <label className="label">TOTP</label>
              <input className="input" value={totp} onChange={(e) => setTotp(e.target.value)} placeholder="6-digit TOTP" required />
            </div>
          </div>

          <button type="submit" className="btn-primary">Connect</button>
        </form>
      )}

      {/* Existing Connections */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Connected Brokers</h2>
          {hasActiveConnection && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600/20 px-3 py-1.5 text-sm font-medium text-brand-400 hover:bg-brand-600/30 disabled:opacity-50"
            >
              <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
              {syncing ? 'Syncing…' : 'Sync Holdings'}
            </button>
          )}
        </div>

        {syncResult && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-900/20 p-3 text-sm text-green-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {syncResult}
          </div>
        )}

        {isLoading ? (
          <p className="text-gray-500">Loading…</p>
        ) : connections.length === 0 ? (
          <p className="text-gray-500">No broker connections yet. Connect above to start tracking.</p>
        ) : (
          <div className="space-y-3">
            {connections.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-800/50 p-4">
                <div>
                  <p className="font-medium capitalize">{getBrokerName(c).replace('_', ' ')}</p>
                  <p className="text-sm text-gray-400">Client: {getClientId(c)}</p>
                  {getConnectedAt(c) && (
                    <p className="text-xs text-gray-500">Connected: {new Date(getConnectedAt(c)!).toLocaleString()}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    getIsActive(c) ? 'bg-green-900/30 text-green-400' : 'bg-gray-700 text-gray-400'
                  )}>
                    {getIsActive(c) ? 'Active' : 'Inactive'}
                  </span>
                  <button onClick={() => handleToggle(c.id, getIsActive(c))} title={getIsActive(c) ? 'Disable' : 'Enable'}>
                    {getIsActive(c) ? (
                      <ToggleRight className="h-6 w-6 text-green-400" />
                    ) : (
                      <ToggleLeft className="h-6 w-6 text-gray-500" />
                    )}
                  </button>
                  <button onClick={() => handleDisconnect(c.id)} className="text-gray-500 hover:text-red-400" title="Disconnect">
                    <Unplug className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live Holdings Preview (after sync) */}
      {holdings.length > 0 && (
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Live Holdings</h2>
            <Link to="/portfolio" className="text-sm text-brand-400 hover:text-brand-300">
              Full Portfolio →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-gray-400">
                  <th className="pb-2">Symbol</th>
                  <th className="pb-2 text-right">Qty</th>
                  <th className="pb-2 text-right">Avg Price</th>
                  <th className="pb-2 text-right">LTP</th>
                  <th className="pb-2 text-right">P&L</th>
                </tr>
              </thead>
              <tbody>
                {holdings.slice(0, 5).map((h) => {
                  const key = `${h.exchange}:${h.symbol}`;
                  const liveTick = ticks[key];
                  const ltp = liveTick?.ltp ?? h.currentPrice;
                  const pnl = (ltp - h.avgPrice) * h.quantity;
                  const isUp = pnl >= 0;

                  return (
                    <tr key={key} className="border-b border-gray-800/50">
                      <td className="py-2 font-medium">
                        {h.symbol}
                        <span className="ml-1.5 text-xs text-gray-500">{h.exchange}</span>
                        {liveTick && (
                          <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-green-400" title="Live price" />
                        )}
                      </td>
                      <td className="py-2 text-right">{h.quantity}</td>
                      <td className="py-2 text-right">{formatINR(h.avgPrice)}</td>
                      <td className="py-2 text-right font-mono">{formatINR(ltp)}</td>
                      <td className={cn('py-2 text-right font-medium flex items-center justify-end gap-1', isUp ? 'text-green-400' : 'text-red-400')}>
                        {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {formatINR(pnl)} ({formatPercent(h.avgPrice > 0 ? ((ltp - h.avgPrice) / h.avgPrice) * 100 : 0)})
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
