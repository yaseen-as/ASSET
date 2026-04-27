import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { usePortfolioStore } from '@/stores/portfolio.store';
import { formatINR, formatPercent } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  Link2,
  Unplug,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface BrokerStatus {
  connected: boolean;
  broker: string | null;
  expiresAt: string | null;
}

interface BrokerConnection {
  id: string;
  broker_name: string;
  broker_user_id: string;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
}

export default function BrokerPage() {
  const [status, setStatus] = useState<BrokerStatus | null>(null);
  const [connections, setConnections] = useState<BrokerConnection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const { holdings, fetchHoldings } = usePortfolioStore();

  const fetchStatus = async () => {
    try {
      const { data } = await api.get('/broker/status');
      setStatus(data.data);
    } catch {
      setStatus({ connected: false, broker: null, expiresAt: null });
    }
  };

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
    fetchStatus();
    fetchConnections();
    fetchHoldings();
  }, []);

  const handleConnectUpstox = async () => {
    setConnecting(true);
    try {
      const { data } = await api.get('/broker/connect/upstox');
      const authUrl: string = data.data.authUrl;
      // Redirect current tab — backend will redirect back to /broker/connected after auth
      window.location.href = authUrl;
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Failed to start Upstox authorization');
      setConnecting(false);
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
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await api.delete(`/broker/disconnect/${id}`);
      toast.success('Disconnected');
      fetchStatus();
      fetchConnections();
    } catch {
      toast.error('Failed to disconnect');
    }
  };

  const isExpiringSoon = (expiresAt: string | null): boolean => {
    if (!expiresAt) return false;
    const msLeft = new Date(expiresAt).getTime() - Date.now();
    return msLeft > 0 && msLeft < 2 * 60 * 60 * 1000; // within 2 hours
  };

  const isExpired = (expiresAt: string | null): boolean => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link2 className="h-6 w-6 text-brand-400" />
        <h1 className="text-2xl font-bold">Broker Integration</h1>
      </div>

      {/* Upstox Connection Status */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Upstox Account</h2>
          {status?.connected && (
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
          <div className="flex items-center gap-2 rounded-lg bg-green-900/20 p-3 text-sm text-green-400">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {syncResult}
          </div>
        )}

        {status === null ? (
          <p className="text-gray-500 text-sm">Checking connection status…</p>
        ) : status.connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-green-900/30 px-2.5 py-0.5 text-xs font-medium text-green-400">
                Connected
              </span>
              <span className="text-sm text-gray-400 capitalize">{status.broker}</span>
            </div>

            {status.expiresAt && (
              <div className={cn(
                'flex items-center gap-2 rounded-lg p-3 text-sm',
                isExpiringSoon(status.expiresAt)
                  ? 'bg-yellow-900/20 text-yellow-400'
                  : 'bg-gray-800/50 text-gray-400',
              )}>
                {isExpiringSoon(status.expiresAt) && <AlertTriangle className="h-4 w-4 shrink-0" />}
                <span>
                  Session expires: {new Date(status.expiresAt).toLocaleString()}
                  {isExpiringSoon(status.expiresAt) && ' — Re-authorize soon'}
                </span>
              </div>
            )}

            <p className="text-xs text-gray-500">
              Upstox tokens are valid until end of each trading day. Re-authorize daily via the button below.
            </p>

            <button
              onClick={handleConnectUpstox}
              disabled={connecting}
              className="flex items-center gap-2 rounded-lg border border-brand-600/40 bg-brand-600/10 px-4 py-2 text-sm font-medium text-brand-400 hover:bg-brand-600/20 disabled:opacity-50"
            >
              <ExternalLink className="h-4 w-4" />
              {connecting ? 'Redirecting…' : 'Re-authorize with Upstox'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {status.expiresAt && isExpired(status.expiresAt) && (
              <div className="flex items-center gap-2 rounded-lg bg-red-900/20 p-3 text-sm text-red-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Your previous session expired. Please re-authorize to continue trading.
              </div>
            )}
            <p className="text-sm text-gray-400">
              Connect your Upstox account via OAuth to access real-time market data, place orders, and sync your portfolio.
            </p>
            <button
              onClick={handleConnectUpstox}
              disabled={connecting}
              className="btn-primary flex items-center gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              {connecting ? 'Redirecting to Upstox…' : 'Connect with Upstox'}
            </button>
          </div>
        )}
      </div>

      {/* Connection List */}
      {connections.length > 0 && (
        <div className="card">
          <h2 className="mb-4 text-lg font-semibold">Connection History</h2>
          {isLoading ? (
            <p className="text-gray-500 text-sm">Loading…</p>
          ) : (
            <div className="space-y-3">
              {connections.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-800/50 p-4">
                  <div>
                    <p className="font-medium capitalize">{c.broker_name.replace('_', ' ')}</p>
                    <p className="text-sm text-gray-400">User: {c.broker_user_id}</p>
                    <p className="text-xs text-gray-500">
                      Connected: {new Date(c.created_at).toLocaleString()}
                    </p>
                    {c.expires_at && (
                      <p className={cn(
                        'text-xs',
                        isExpired(c.expires_at) ? 'text-red-400' : 'text-gray-500',
                      )}>
                        {isExpired(c.expires_at) ? 'Expired: ' : 'Expires: '}
                        {new Date(c.expires_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      c.is_active ? 'bg-green-900/30 text-green-400' : 'bg-gray-700 text-gray-400',
                    )}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                    <button
                      onClick={() => handleDisconnect(c.id)}
                      className="text-gray-500 hover:text-red-400"
                      title="Disconnect"
                    >
                      <Unplug className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Live Holdings Preview */}
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
                  const ltp = h.currentPrice;
                  const pnl = (ltp - h.avgPrice) * h.quantity;
                  const isUp = pnl >= 0;

                  return (
                    <tr key={key} className="border-b border-gray-800/50">
                      <td className="py-2 font-medium">
                        {h.symbol}
                        <span className="ml-1.5 text-xs text-gray-500">{h.exchange}</span>
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
