import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { Lightbulb, TrendingUp, TrendingDown } from 'lucide-react';

interface Signal {
  id: string;
  symbol: string;
  exchange: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  source: string;
  reasoning: string;
  created_at: string;
}

export default function RecommendationsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchSignals = async () => {
      setIsLoading(true);
      try {
        const { data } = await api.get('/recommendations/personalized');
        setSignals(data.data || []);
      } catch {
        // Fallback to general recommendations
        try {
          const { data } = await api.get('/recommendations');
          setSignals(data.data || []);
        } catch {
          // ignore
        }
      } finally {
        setIsLoading(false);
      }
    };
    fetchSignals();
  }, []);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-6 w-6 text-brand-400" />
        <h1 className="text-2xl font-bold">Recommendations</h1>
      </div>

      {isLoading ? (
        <p className="text-gray-500">Analyzing market data…</p>
      ) : signals.length === 0 ? (
        <div className="card text-center py-12">
          <Lightbulb className="mx-auto h-12 w-12 text-gray-600" />
          <p className="mt-4 text-gray-500">No signals available right now.</p>
          <p className="text-sm text-gray-600">Signals are generated from technical analysis of your watchlist stocks.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {signals.map((s) => (
            <div key={s.id} className={`card border ${actionBg[s.action]}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">{s.symbol}</h3>
                <span className={`text-lg font-bold ${actionColor[s.action]}`}>
                  {s.action === 'BUY' && <TrendingUp className="inline mr-1 h-5 w-5" />}
                  {s.action === 'SELL' && <TrendingDown className="inline mr-1 h-5 w-5" />}
                  {s.action}
                </span>
              </div>

              <p className="mt-1 text-sm text-gray-400">{s.exchange}</p>

              <div className="mt-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Confidence</span>
                  <span className="font-medium">{(s.confidence * 100).toFixed(0)}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-800">
                  <div
                    className={`h-full rounded-full ${s.action === 'BUY' ? 'bg-green-500' : s.action === 'SELL' ? 'bg-red-500' : 'bg-yellow-500'}`}
                    style={{ width: `${s.confidence * 100}%` }}
                  />
                </div>
              </div>

              <p className="mt-3 text-sm text-gray-400">{s.reasoning}</p>

              <div className="mt-3 flex items-center justify-between text-xs text-gray-600">
                <span>{s.source}</span>
                <span>{new Date(s.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
