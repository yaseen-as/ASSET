import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

interface Alert {
  id: string;
  symbol: string;
  exchange: string;
  condition_type: string;
  threshold: number;
  status: string;
  trigger_count: number;
  label: string | null;
  created_at: string;
}

const conditionLabels: Record<string, string> = {
  price_above: 'Price Above',
  price_below: 'Price Below',
  price_crosses_above: 'Crosses Above',
  price_crosses_below: 'Crosses Below',
  percent_change_above: '% Change Above',
  percent_change_below: '% Change Below',
  volume_above: 'Volume Above',
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Form
  const [symbol, setSymbol] = useState('');
  const [conditionType, setConditionType] = useState('price_above');
  const [threshold, setThreshold] = useState('');
  const [label, setLabel] = useState('');

  const fetchAlerts = async () => {
    setIsLoading(true);
    try {
      const { data } = await api.get('/alerts');
      setAlerts(data.data || []);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/alerts', {
        symbol: symbol.toUpperCase(),
        condition_type: conditionType,
        threshold: parseFloat(threshold),
        label: label || undefined,
      });
      toast.success('Alert created');
      setSymbol('');
      setThreshold('');
      setLabel('');
      fetchAlerts();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || err.response?.data?.message || 'Failed to create alert');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/alerts/${id}`);
      setAlerts((a) => a.filter((al) => al.id !== id));
      toast.success('Alert deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleReactivate = async (id: string) => {
    try {
      await api.post(`/alerts/${id}/reactivate`);
      fetchAlerts();
      toast.success('Alert reactivated');
    } catch {
      toast.error('Cannot reactivate');
    }
  };

  const statusColor: Record<string, string> = {
    active: 'badge-green',
    triggered: 'badge-yellow',
    disabled: 'badge-red',
    expired: 'badge-red',
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Price Alerts</h1>

      <form onSubmit={handleCreate} className="card grid grid-cols-1 gap-3 sm:grid-cols-5">
        <div>
          <label className="label">Symbol</label>
          <input className="input" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="RELIANCE" required />
        </div>
        <div>
          <label className="label">Condition</label>
          <select className="input" value={conditionType} onChange={(e) => setConditionType(e.target.value)}>
            {Object.entries(conditionLabels).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Threshold</label>
          <input className="input" type="number" step="0.01" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="2500.00" required />
        </div>
        <div>
          <label className="label">Label (optional)</label>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="My alert" />
        </div>
        <div className="flex items-end">
          <button type="submit" className="btn-primary w-full">
            <Plus className="mr-1 h-4 w-4" /> Create
          </button>
        </div>
      </form>

      <div className="card">
        {isLoading ? (
          <p className="text-gray-500">Loading…</p>
        ) : alerts.length === 0 ? (
          <p className="text-gray-500">No alerts yet. Create one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-gray-400">
                  <th className="pb-2">Symbol</th>
                  <th className="pb-2">Condition</th>
                  <th className="pb-2 text-right">Threshold</th>
                  <th className="pb-2">Label</th>
                  <th className="pb-2 text-center">Status</th>
                  <th className="pb-2 text-center">Triggers</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-2 font-medium">{a.symbol}</td>
                    <td className="py-2 text-gray-400">{conditionLabels[a.condition_type] || a.condition_type}</td>
                    <td className="py-2 text-right">{a.threshold}</td>
                    <td className="py-2 text-gray-400">{a.label || '—'}</td>
                    <td className="py-2 text-center">
                      <span className={statusColor[a.status] || 'badge'}>{a.status}</span>
                    </td>
                    <td className="py-2 text-center">{a.trigger_count}</td>
                    <td className="py-2 text-right space-x-2">
                      {(a.status === 'triggered' || a.status === 'disabled') && (
                        <button onClick={() => handleReactivate(a.id)} className="text-brand-400 hover:text-brand-300" title="Reactivate">
                          <RefreshCw className="inline h-4 w-4" />
                        </button>
                      )}
                      <button onClick={() => handleDelete(a.id)} className="text-gray-500 hover:text-red-400" title="Delete">
                        <Trash2 className="inline h-4 w-4" />
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
