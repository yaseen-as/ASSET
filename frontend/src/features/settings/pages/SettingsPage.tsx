import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import api from '@/lib/api';
import { formatINR } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);

  // Notification preferences
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [emailRecommendations, setEmailRecommendations] = useState(true);
  const [emailOrders, setEmailOrders] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);

  // Paper trading
  const [paperTrading, setPaperTrading] = useState(false);
  const [paperBalance, setPaperBalance] = useState<{ cash: number; invested: number; totalValue: number } | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    api.get('/notifications/preferences').then(({ data }) => {
      const p = data.data;
      if (p) {
        setEmailAlerts(p.email_alerts);
        setEmailRecommendations(p.email_recommendations);
        setEmailOrders(p.email_orders);
        setPushEnabled(p.push_enabled);
      }
    }).catch(() => {});

    api.get('/users/profile').then(({ data }) => {
      const p = data.data;
      if (p) {
        setPaperTrading(p.paperTrading ?? p.paper_trading ?? false);
      }
    }).catch(() => {});

    loadPaperBalance();
  }, []);

  const loadPaperBalance = async () => {
    try {
      const { data } = await api.get('/broker/paper/balance');
      setPaperBalance(data.data);
    } catch { /* ignore */ }
  };

  const savePreferences = async () => {
    try {
      await api.patch('/notifications/preferences', {
        email_alerts: emailAlerts,
        email_recommendations: emailRecommendations,
        email_orders: emailOrders,
        push_enabled: pushEnabled,
      });
      toast.success('Preferences saved');
    } catch {
      toast.error('Failed to save');
    }
  };

  const togglePaperTrading = async () => {
    const newValue = !paperTrading;
    try {
      await api.patch('/users/profile', { paperTrading: newValue });
      setPaperTrading(newValue);
      toast.success(newValue ? 'Paper trading enabled' : 'Live trading enabled');
      if (newValue) loadPaperBalance();
    } catch {
      toast.error('Failed to update');
    }
  };

  const resetPaperAccount = async () => {
    setResetting(true);
    try {
      await api.post('/broker/paper/reset');
      toast.success('Paper account reset');
      loadPaperBalance();
    } catch {
      toast.error('Failed to reset');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Profile */}
      <div className="card space-y-3">
        <h2 className="text-lg font-semibold">Profile</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Name</label>
            <input className="input" value={user?.name || ''} readOnly />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" value={user?.email || ''} readOnly />
          </div>
        </div>
      </div>

      {/* Trading Mode */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold">Trading Mode</h2>

        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">{paperTrading ? 'Paper Trading' : 'Live Trading'}</p>
            <p className="text-sm text-gray-500">
              {paperTrading
                ? 'Orders are simulated — no real money is used.'
                : 'Orders are sent to your connected broker.'}
            </p>
          </div>
          <button
            onClick={togglePaperTrading}
            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
              paperTrading ? 'bg-yellow-600' : 'bg-green-600'
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                paperTrading ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {paperTrading && (
          <>
            {!paperTrading ? null : (
              <div className="rounded-lg border border-yellow-800/50 bg-yellow-900/20 p-3 text-sm text-yellow-400">
                Paper trading mode is active. All orders will be simulated at current market prices.
              </div>
            )}

            {paperBalance && (
              <div className="grid grid-cols-3 gap-3 text-center text-sm">
                <div>
                  <p className="text-gray-500">Cash</p>
                  <p className="font-bold text-green-400">{formatINR(paperBalance.cash)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Invested</p>
                  <p className="font-bold">{formatINR(paperBalance.invested)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Total Value</p>
                  <p className="font-bold text-brand-400">{formatINR(paperBalance.totalValue)}</p>
                </div>
              </div>
            )}

            <button
              onClick={resetPaperAccount}
              disabled={resetting}
              className="btn-secondary text-sm"
            >
              {resetting ? 'Resetting...' : 'Reset Paper Account'}
            </button>
          </>
        )}
      </div>

      {/* Notification Preferences */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold">Notification Preferences</h2>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={emailAlerts}
            onChange={(e) => setEmailAlerts(e.target.checked)}
            className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm">Email me when alerts trigger</span>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={emailRecommendations}
            onChange={(e) => setEmailRecommendations(e.target.checked)}
            className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm">Email me new recommendations</span>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={emailOrders}
            onChange={(e) => setEmailOrders(e.target.checked)}
            className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm">Email me order executions</span>
        </label>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={pushEnabled}
            onChange={(e) => setPushEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm">Enable push notifications</span>
        </label>

        <button onClick={savePreferences} className="btn-primary">
          Save Preferences
        </button>
      </div>
    </div>
  );
}
