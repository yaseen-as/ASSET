import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);

  // Notification preferences
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [emailRecommendations, setEmailRecommendations] = useState(true);
  const [emailOrders, setEmailOrders] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);

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
  }, []);

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
