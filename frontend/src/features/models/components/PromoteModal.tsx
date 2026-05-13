import { useState } from 'react';
import { X } from 'lucide-react';
import { promoteModel, type ModelMeta, type ModelStatus } from '@/lib/ml-api';

interface Props {
  model: ModelMeta;
  onClose: () => void;
  onPromoted: (m: ModelMeta) => void;
}

export default function PromoteModal({ model, onClose, onPromoted }: Props) {
  const [status, setStatus] = useState<ModelStatus>(model.status);
  const [rollout, setRollout] = useState(model.rollout_percent);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await promoteModel(model.id, status, rollout);
      onPromoted(updated);
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? 'Promote failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Promote Model</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 text-sm text-gray-400">
          <div><strong className="text-gray-200">{model.name}</strong> v{model.version}</div>
          <div className="text-xs">{model.id}</div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ModelStatus)}
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm w-full"
            >
              <option value="draft">draft</option>
              <option value="canary">canary</option>
              <option value="production">production</option>
              <option value="retired">retired</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Rollout %</label>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={rollout}
              onChange={(e) => setRollout(parseInt(e.target.value, 10))}
              className="w-full"
            />
            <div className="text-right text-xs text-gray-400">{rollout}%</div>
          </div>

          {status === 'production' && rollout < 100 && (
            <p className="text-xs text-yellow-400">
              Production typically rolls out at 100%. Use <code>canary</code> for partial rollouts.
            </p>
          )}

          {error && <div className="text-xs text-red-400">{error}</div>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary text-sm" disabled={submitting}>Cancel</button>
          <button onClick={submit} className="btn-primary text-sm" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
