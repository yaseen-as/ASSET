import { useEffect, useState } from 'react';
import { Cpu, RefreshCw } from 'lucide-react';
import { listModels, type ModelMeta, type ModelName, type ModelStatus } from '@/lib/ml-api';
import PromoteModal from '../components/PromoteModal';

const statusBadge: Record<ModelStatus, string> = {
  draft: 'bg-gray-800 text-gray-300',
  canary: 'bg-yellow-900/40 text-yellow-300',
  production: 'bg-green-900/40 text-green-300',
  retired: 'bg-gray-900 text-gray-500',
};

export default function ModelsPage() {
  const [models, setModels] = useState<ModelMeta[]>([]);
  const [filter, setFilter] = useState<ModelName | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<ModelMeta | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await listModels(filter === 'all' ? undefined : filter);
      setModels(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filter]);

  function handlePromoted(updated: ModelMeta) {
    setModels((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-6 w-6 text-brand-400" />
          <h1 className="text-2xl font-bold">Model Registry</h1>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as ModelName | 'all')}
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm"
          >
            <option value="all">All families</option>
            <option value="technical">technical</option>
            <option value="fundamental">fundamental</option>
            <option value="sentiment">sentiment</option>
            <option value="meta">meta</option>
          </select>
          <button onClick={load} className="btn-secondary flex items-center gap-2" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        {models.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            <Cpu className="mx-auto h-12 w-12 text-gray-700" />
            <p className="mt-3">No models registered. Train + upload via the ML pipeline.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50 text-xs uppercase text-gray-400">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Version</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right">Rollout</th>
                <th className="px-3 py-2 text-left">Feature Set</th>
                <th className="px-3 py-2 text-right">Val AUC</th>
                <th className="px-3 py-2 text-right">Created</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => {
                const auc = (m.metrics as any)?.val_auc;
                return (
                  <tr key={m.id} className="border-t border-gray-800 hover:bg-gray-800/30">
                    <td className="px-3 py-2 font-semibold">{m.name}</td>
                    <td className="px-3 py-2 font-mono text-gray-400">{m.version}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadge[m.status]}`}>{m.status}</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{m.rollout_percent}%</td>
                    <td className="px-3 py-2 text-gray-400">{m.feature_set}</td>
                    <td className="px-3 py-2 text-right font-mono text-gray-400">
                      {typeof auc === 'number' ? auc.toFixed(3) : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-gray-500">
                      {new Date(m.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => setEditing(m)} className="btn-secondary text-xs">Promote</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <PromoteModal
          model={editing}
          onClose={() => setEditing(null)}
          onPromoted={handlePromoted}
        />
      )}
    </div>
  );
}
