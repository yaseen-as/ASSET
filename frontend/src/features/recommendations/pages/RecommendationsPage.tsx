import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Lightbulb, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';

// Normalized signal shape used by this page
interface Signal {
  id: string;
  symbol: string;
  exchange: string;
  signalType: 'BUY' | 'SELL' | 'HOLD';
  confidence: number; // 0–100
  source: string;
  reasoning: string;
  createdAt: string;
}

// Normalize raw API rows → Signal
// Handles both camelCase (getSignals) and snake_case (getUserRecommendations raw join)
function normalize(raw: any): Signal {
  return {
    id: raw.id,
    symbol: raw.symbol,
    exchange: raw.exchange,
    signalType: raw.signalType ?? raw.signal_type ?? 'HOLD',
    confidence: raw.confidence ?? 0,
    source: raw.source ?? 'rule_engine',
    reasoning: raw.reasoning ?? '',
    createdAt: raw.createdAt ?? raw.created_at ?? '',
  };
}

const actionColor = {
  BUY: 'text-green-400',
  SELL: 'text-red-400',
  HOLD: 'text-yellow-400',
};

const actionBg = {
  BUY: 'bg-green-900/30 border-green-800',
  SELL: 'bg-red-900/30 border-red-800',
  HOLD: 'bg-yellow-900/30 border-yellow-800',
};

export default function RecommendationsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [tab, setTab] = useState<'personalized' | 'all'>('personalized');

  const fetchSignals = async (view: typeof tab) => {
    setIsLoading(true);
    try {
      if (view === 'personalized') {
        try {
          const { data } = await api.get('/recommendations/personalized');
          setSignals((data.data || []).map(normalize));
          return;
        } catch {
          // fall through to general
        }
      }
      const { data } = await api.get('/recommendations?limit=50');
      setSignals((data.data || []).map(normalize));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSignals(tab);
  }, [tab]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-6 w-6 text-brand-400" />
          <h1 className="text-2xl font-bold">Recommendations</h1>
        </div>
        <button
          onClick={() => fetchSignals(tab)}
          className="btn-secondary flex items-center gap-2"
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-gray-800 bg-gray-900 p-1 w-fit">
        {(['personalized', 'all'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {t === 'personalized' ? 'For You' : 'All Signals'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-gray-500">Analyzing market data…</p>
      ) : signals.length === 0 ? (
        <div className="card py-12 text-center">
          <Lightbulb className="mx-auto h-12 w-12 text-gray-600" />
          <p className="mt-4 text-gray-500">No signals available right now.</p>
          <p className="text-sm text-gray-600">
            Signals are generated after market close from technical analysis of tracked symbols.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {signals.map((s) => (
            <div key={s.id} className={`card border ${actionBg[s.signalType]}`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold">{s.symbol}</h3>
                  <p className="text-xs text-gray-400">{s.exchange}</p>
                </div>
                <span className={`flex items-center gap-1 text-lg font-bold ${actionColor[s.signalType]}`}>
                  {s.signalType === 'BUY' && <TrendingUp className="h-5 w-5" />}
                  {s.signalType === 'SELL' && <TrendingDown className="h-5 w-5" />}
                  {s.signalType}
                </span>
              </div>

              {/* Confidence bar */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Confidence</span>
                  <span className="font-medium">{s.confidence.toFixed(0)}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-800">
                  <div
                    className={`h-full rounded-full transition-all ${
                      s.signalType === 'BUY'
                        ? 'bg-green-500'
                        : s.signalType === 'SELL'
                        ? 'bg-red-500'
                        : 'bg-yellow-500'
                    }`}
                    style={{ width: `${s.confidence}%` }}
                  />
                </div>
              </div>

              <p className="mt-3 text-sm text-gray-300">{s.reasoning}</p>

              <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
                <span className="capitalize">{s.source.replace('_', ' ')}</span>
                <span>
                  {s.createdAt
                    ? new Date(s.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
