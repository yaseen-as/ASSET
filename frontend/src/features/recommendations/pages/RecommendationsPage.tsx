import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lightbulb, RefreshCw, ShoppingCart, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import { fetchTopRecommendations, rankUniverse, type RankedRow } from '@/lib/ml-api';

const todayIso = () => new Date().toISOString().slice(0, 10);

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  const v = value ?? 0;
  const pct = Math.max(0, Math.min(100, v * 100));
  const color = v >= 0.6 ? 'bg-green-500' : v >= 0.4 ? 'bg-yellow-500' : 'bg-gray-600';
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>{label}</span>
        <span className="font-mono">{value === null ? '—' : v.toFixed(3)}</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-gray-800">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function RecommendationsPage() {
  const navigate = useNavigate();
  const [date, setDate] = useState(todayIso());
  const [limit, setLimit] = useState(20);
  const [rows, setRows] = useState<RankedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [ranking, setRanking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTopRecommendations(date, limit);
      setRows(data);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? e?.message ?? 'Failed to load');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function runRanking() {
    setRanking(true);
    try {
      await rankUniverse('NSE', date, 100);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? 'Ranking failed');
    } finally {
      setRanking(false);
    }
  }

  useEffect(() => {
    load();
  }, [date, limit]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-6 w-6 text-brand-400" />
          <h1 className="text-2xl font-bold">ML Recommendations</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm"
          />
          <select
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value, 10))}
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm"
          >
            <option value={10}>Top 10</option>
            <option value={20}>Top 20</option>
            <option value={50}>Top 50</option>
            <option value={100}>Top 100</option>
          </select>
          <button onClick={load} className="btn-secondary flex items-center gap-2" disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={runRanking} className="btn-primary flex items-center gap-2" disabled={ranking}>
            <TrendingUp className={`h-4 w-4 ${ranking ? 'animate-pulse' : ''}`} />
            Run Ranking
          </button>
        </div>
      </div>

      {error && (
        <div className="card border-red-900 bg-red-950/40 text-sm text-red-300">{error}</div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="card py-12 text-center">
          <Lightbulb className="mx-auto h-12 w-12 text-gray-600" />
          <p className="mt-4 text-gray-500">No ranked symbols for {date}.</p>
          <p className="text-sm text-gray-600">
            Try a different date or click <strong>Run Ranking</strong> to score the universe.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50 text-xs uppercase text-gray-400">
              <tr>
                <th className="px-3 py-2 text-left">Rank</th>
                <th className="px-3 py-2 text-left">Symbol</th>
                <th className="px-3 py-2 text-right">Final</th>
                <th className="px-3 py-2 text-right hidden md:table-cell">Tech</th>
                <th className="px-3 py-2 text-right hidden md:table-cell">Fund</th>
                <th className="px-3 py-2 text-right hidden md:table-cell">Sent</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <RecRow
                  key={r.id}
                  row={r}
                  expanded={expanded === r.id}
                  onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                  onTrade={() => navigate(`/orders?symbol=${r.symbol}&exchange=${r.exchange}&action=BUY`)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RecRow({
  row,
  expanded,
  onToggle,
  onTrade,
}: {
  row: RankedRow;
  expanded: boolean;
  onToggle: () => void;
  onTrade: () => void;
}) {
  return (
    <>
      <tr className="border-t border-gray-800 hover:bg-gray-800/30 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2 font-mono">{row.rank ?? '—'}</td>
        <td className="px-3 py-2">
          <div className="font-semibold">{row.symbol}</div>
          <div className="text-xs text-gray-500">{row.exchange}</div>
        </td>
        <td className="px-3 py-2 text-right font-mono">{row.final_score.toFixed(3)}</td>
        <td className="px-3 py-2 text-right font-mono text-gray-400 hidden md:table-cell">
          {row.technical_score?.toFixed(3) ?? '—'}
        </td>
        <td className="px-3 py-2 text-right font-mono text-gray-400 hidden md:table-cell">
          {row.fundamental_score?.toFixed(3) ?? '—'}
        </td>
        <td className="px-3 py-2 text-right font-mono text-gray-400 hidden md:table-cell">
          {row.sentiment_score?.toFixed(3) ?? '—'}
        </td>
        <td className="px-3 py-2 text-right">
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-gray-800 bg-gray-900/50">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              <ScoreBar label="Technical" value={row.technical_score} />
              <ScoreBar label="Fundamental" value={row.fundamental_score} />
              <ScoreBar label="Sentiment" value={row.sentiment_score} />
            </div>
            <button onClick={(e) => { e.stopPropagation(); onTrade(); }} className="btn-primary text-sm">
              <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
              Trade {row.symbol}
            </button>
          </td>
        </tr>
      )}
    </>
  );
}
