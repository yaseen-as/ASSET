import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Link2, Unplug, ToggleLeft, ToggleRight } from 'lucide-react';
import toast from 'react-hot-toast';

interface BrokerConnection {
  id: string;
  broker_name: string;
  client_id: string;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
}

export default function BrokerPage() {
  const [connections, setConnections] = useState<BrokerConnection[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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
      toast.success('Broker connected!');
      setClientId('');
      setPassword('');
      setTotp('');
      setApiKey('');
      fetchConnections();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || err.response?.data?.message || 'Connection failed');
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
      await api.patch(`/broker/connections/${id}/toggle`, { is_active: !currentState });
      fetchConnections();
    } catch {
      toast.error('Failed to toggle');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link2 className="h-6 w-6 text-brand-400" />
        <h1 className="text-2xl font-bold">Broker Integration</h1>
      </div>

      {/* Connect Form */}
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

      {/* Existing Connections */}
      <div className="card">
        <h2 className="mb-4 text-lg font-semibold">Connected Brokers</h2>
        {isLoading ? (
          <p className="text-gray-500">Loading…</p>
        ) : connections.length === 0 ? (
          <p className="text-gray-500">No broker connections yet.</p>
        ) : (
          <div className="space-y-3">
            {connections.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-gray-800 bg-gray-800/50 p-4">
                <div>
                  <p className="font-medium">{c.broker_name}</p>
                  <p className="text-sm text-gray-400">Client: {c.client_id}</p>
                  {c.last_synced_at && (
                    <p className="text-xs text-gray-500">Last synced: {new Date(c.last_synced_at).toLocaleString()}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => handleToggle(c.id, c.is_active)} title={c.is_active ? 'Disable' : 'Enable'}>
                    {c.is_active ? (
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
    </div>
  );
}
