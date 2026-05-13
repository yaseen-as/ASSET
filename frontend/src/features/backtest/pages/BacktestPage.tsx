import { useEffect, useState } from 'react';
import { FlaskConical, RefreshCw } from 'lucide-react';
import { fetchBacktestRun, listBacktestResults, listModels, type BacktestRecord, type ModelMeta } from '@/lib/ml-api';
import { usePolling } from '@/hooks/usePolling';
import BacktestForm from '../components/BacktestForm';
import EquityChart from '../components/EquityChart';
import TradesTable from '../components/TradesTable';

function Stat({ label, value, color = 'text-gray-200' }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
    </div>
  );
}

export default function BacktestPage() {
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [current, setCurrent] = useState<BacktestRecord | null>(null);
  const [history, setHistory] = useState<BacktestRecord[]>([]);
  const [models, setModels] = useState<ModelMeta[]>([]);
  const [historyModelId, setHistoryModelId] = useState<string>('');

  useEffect(() => {
    listModels().then((m) => {
      setModels(m);
      if (m.length && !historyModelId) setHistoryModelId(m[0].id);
    });
  }, []);

  useEffect(() => {
    if (!historyModelId) return;
    listBacktestResults(historyModelId, 20).then(setHistory).catch(() => setHistory([]));
  }, [historyModelId, current?.status]);

  // Poll current run every 5s while it's running
  usePolling(
    async () => {
      if (!currentId) return;
      try {
        const rec = await fetchBacktestRun(currentId);
        setCurrent(rec);
      } catch {
        /* keep last state */
      }
    },
    5000,
    { enabled: !!currentId && current?.status === 'running', immediate: false },
  );

  function handleNewSubmission(id: string) {
    setCurrentId(id);
    setCurrent({
      id, model_id: '', start_date: '', end_date: '', params: {} as any,
      status: 'running', sharpe_ratio: 0, max_drawdown: 0, win_rate: 0, cagr: 0,
      total_trades: 0, equity_curve: [], trades: [], created_at: new Date().toISOString(),
    });
  }

  async function refreshCurrent() {
    if (!currentId) return;
    setCurrent(await fetchBacktestRun(currentId));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-6 w-6 text-brand-400" />
        <h1 className="text-2xl font-bold">Backtest</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <BacktestForm onSubmitted={handleNewSubmission} />

        <div className="space-y-4">
          {current ? (
            <>
              <div className="card">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-300">Run {current.id.slice(0, 8)}</h3>
                    <p className="text-xs text-gray-500">{current.start_date} → {current.end_date}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      current.status === 'completed' ? 'bg-green-900/40 text-green-400' :
                      current.status === 'running' ? 'bg-yellow-900/40 text-yellow-400 animate-pulse' :
                      'bg-gray-800 text-gray-400'
                    }`}>
                      {current.status}
                    </span>
                    <button onClick={refreshCurrent} className="btn-secondary text-xs flex items-center gap-1">
                      <RefreshCw className="h-3 w-3" /> Refresh
                    </button>
                  </div>
                </div>

                {current.status === 'completed' && (
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <Stat label="Sharpe" value={current.sharpe_ratio.toFixed(2)} color={current.sharpe_ratio > 1 ? 'text-green-400' : 'text-gray-300'} />
                    <Stat label="Max DD" value={`${(current.max_drawdown * 100).toFixed(1)}%`} color="text-red-400" />
                    <Stat label="Win Rate" value={`${(current.win_rate * 100).toFixed(1)}%`} />
                    <Stat label="CAGR" value={`${(current.cagr * 100).toFixed(1)}%`} color={current.cagr > 0 ? 'text-green-400' : 'text-red-400'} />
                    <Stat label="Trades" value={current.total_trades.toString()} />
                  </div>
                )}

                {current.status === 'running' && (
                  <p className="text-sm text-gray-400">Walking forward through the date range… results will appear here automatically.</p>
                )}
              </div>

              {current.equity_curve.length > 0 && (
                <EquityChart curve={current.equity_curve} initial={current.params?.initial_capital ?? 0} />
              )}
              {current.trades.length > 0 && <TradesTable trades={current.trades} />}
            </>
          ) : (
            <div className="card py-12 text-center text-gray-500">
              <FlaskConical className="mx-auto h-12 w-12 text-gray-600" />
              <p className="mt-3">Submit a backtest from the left panel to see results here.</p>
            </div>
          )}
        </div>
      </div>

      {/* History */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-300">Recent Runs</h3>
          <select
            value={historyModelId}
            onChange={(e) => setHistoryModelId(e.target.value)}
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1 text-sm"
          >
            {models.map((m) => <option key={m.id} value={m.id}>{m.name} v{m.version}</option>)}
          </select>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-gray-500">No backtests yet for this model.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-gray-400">
              <tr>
                <th className="px-2 py-2 text-left">Date Range</th>
                <th className="px-2 py-2 text-right">Sharpe</th>
                <th className="px-2 py-2 text-right">Max DD</th>
                <th className="px-2 py-2 text-right">Win Rate</th>
                <th className="px-2 py-2 text-right">CAGR</th>
                <th className="px-2 py-2 text-right">Trades</th>
                <th className="px-2 py-2 text-right">Run At</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-gray-800 hover:bg-gray-800/40 cursor-pointer"
                  onClick={() => { setCurrentId(r.id); setCurrent(r); }}
                >
                  <td className="px-2 py-1.5">{r.start_date} → {r.end_date}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{r.sharpe_ratio.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-red-400">{(r.max_drawdown * 100).toFixed(1)}%</td>
                  <td className="px-2 py-1.5 text-right font-mono">{(r.win_rate * 100).toFixed(1)}%</td>
                  <td className="px-2 py-1.5 text-right font-mono">{(r.cagr * 100).toFixed(1)}%</td>
                  <td className="px-2 py-1.5 text-right">{r.total_trades}</td>
                  <td className="px-2 py-1.5 text-right text-gray-500">
                    {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
