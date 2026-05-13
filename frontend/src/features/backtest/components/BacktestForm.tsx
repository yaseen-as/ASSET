import { useEffect, useState } from 'react';
import { listModels, submitBacktest, type ModelMeta } from '@/lib/ml-api';
import { Play } from 'lucide-react';

interface Props {
  onSubmitted: (id: string) => void;
}

export default function BacktestForm({ onSubmitted }: Props) {
  const [models, setModels] = useState<ModelMeta[]>([]);
  const [modelId, setModelId] = useState('');
  const [start, setStart] = useState('2024-01-01');
  const [end, setEnd] = useState(new Date().toISOString().slice(0, 10));
  const [topN, setTopN] = useState(20);
  const [stopLoss, setStopLoss] = useState(-5);
  const [takeProfit, setTakeProfit] = useState(10);
  const [maxHold, setMaxHold] = useState(10);
  const [capital, setCapital] = useState(1_000_000);
  const [posFrac, setPosFrac] = useState(5);
  const [costBps, setCostBps] = useState(20);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listModels()
      .then((m) => {
        // Only active models can be backtested meaningfully
        const active = m.filter((x) => x.status === 'production' || x.status === 'canary' || x.status === 'draft');
        setModels(active);
        if (active.length && !modelId) setModelId(active[0].id);
      })
      .catch((e) => setError(e?.message ?? 'Failed to load models'));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!modelId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await submitBacktest({
        model_id: modelId,
        start_date: start,
        end_date: end,
        params: {
          top_n: topN,
          position_size_fraction: posFrac / 100,
          stop_loss: stopLoss / 100,
          take_profit: takeProfit / 100,
          max_holding_days: maxHold,
          initial_capital: capital,
          cost_bps: costBps,
          exchange: 'NSE',
        },
      });
      onSubmitted(res.id);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls = 'rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm w-full';
  const labelCls = 'block text-xs text-gray-400 mb-1';

  return (
    <form onSubmit={handleSubmit} className="card space-y-3">
      <h3 className="text-sm font-semibold text-gray-300">New Backtest</h3>

      <div>
        <label className={labelCls}>Model</label>
        <select className={inputCls} value={modelId} onChange={(e) => setModelId(e.target.value)} required>
          {models.length === 0 && <option value="">No models registered</option>}
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} v{m.version} ({m.status})
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Start</label>
          <input type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} required />
        </div>
        <div>
          <label className={labelCls}>End</label>
          <input type="date" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Top N per day</label>
          <input type="number" min={1} max={200} className={inputCls} value={topN} onChange={(e) => setTopN(parseInt(e.target.value, 10))} />
        </div>
        <div>
          <label className={labelCls}>Position size (% equity)</label>
          <input type="number" min={1} max={100} step={0.5} className={inputCls} value={posFrac} onChange={(e) => setPosFrac(parseFloat(e.target.value))} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Stop loss (%)</label>
          <input type="number" min={-99} max={-0.1} step={0.5} className={inputCls} value={stopLoss} onChange={(e) => setStopLoss(parseFloat(e.target.value))} />
        </div>
        <div>
          <label className={labelCls}>Take profit (%)</label>
          <input type="number" min={0.1} step={0.5} className={inputCls} value={takeProfit} onChange={(e) => setTakeProfit(parseFloat(e.target.value))} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Max holding (days)</label>
          <input type="number" min={1} max={252} className={inputCls} value={maxHold} onChange={(e) => setMaxHold(parseInt(e.target.value, 10))} />
        </div>
        <div>
          <label className={labelCls}>Cost (bps round-trip)</label>
          <input type="number" min={0} max={500} className={inputCls} value={costBps} onChange={(e) => setCostBps(parseFloat(e.target.value))} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Initial capital (₹)</label>
        <input type="number" min={10000} step={10000} className={inputCls} value={capital} onChange={(e) => setCapital(parseFloat(e.target.value))} />
      </div>

      {error && <div className="text-xs text-red-400">{error}</div>}

      <button type="submit" disabled={submitting || !modelId} className="btn-primary w-full flex items-center justify-center gap-2">
        <Play className="h-4 w-4" />
        {submitting ? 'Submitting…' : 'Run Backtest'}
      </button>
    </form>
  );
}
