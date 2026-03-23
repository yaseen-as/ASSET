import { useEffect, useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  PieChart as PieIcon,
  Shield,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  CartesianGrid,
} from 'recharts';
import { useAnalyticsStore } from '@/stores/analytics.store';

const COLORS = [
  '#6366f1', '#22d3ee', '#f59e0b', '#10b981', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b',
];

const PERIODS = [
  { label: '7D', value: '7d' },
  { label: '1M', value: '30d' },
  { label: '3M', value: '90d' },
  { label: '1Y', value: '1y' },
];

export default function AnalyticsPage() {
  const { summary, pnlHistory, allocation, movers, loading, fetchAll, fetchPnlHistory } =
    useAnalyticsStore();
  const [period, setPeriod] = useState('30d');

  useEffect(() => {
    fetchAll(period);
  }, []);

  const handlePeriodChange = (p: string) => {
    setPeriod(p);
    fetchPnlHistory(p);
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

  const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-sm text-gray-400">Portfolio intelligence & performance</p>
        </div>
        <button
          onClick={() => fetchAll(period)}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label="Portfolio Value"
            value={fmt(summary.totalValue)}
            sub={`P&L: ${fmt(summary.totalPnl)} (${pct(summary.pnlPercent)})`}
            positive={summary.totalPnl >= 0}
            icon={<BarChart3 className="h-5 w-5" />}
          />
          <SummaryCard
            label="Day Change"
            value={fmt(summary.dayChange)}
            sub={pct(summary.dayChangePct)}
            positive={summary.dayChange >= 0}
            icon={summary.dayChange >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          />
          <SummaryCard
            label="Diversification"
            value={`${summary.diversificationScore}/100`}
            sub={`${summary.holdingCount} stocks, ${summary.sectorCount} sectors`}
            positive={summary.diversificationScore >= 50}
            icon={<Shield className="h-5 w-5" />}
          />
          <SummaryCard
            label="Holdings"
            value={String(summary.holdingCount)}
            sub={`Across ${summary.sectorCount} sectors`}
            positive={true}
            icon={<PieIcon className="h-5 w-5" />}
          />
        </div>
      )}

      {/* P&L Chart */}
      <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">P&L History</h2>
          <div className="flex gap-1 rounded-lg bg-gray-800 p-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => handlePeriodChange(p.value)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  period === p.value
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {pnlHistory.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={pnlHistory}>
              <defs>
                <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis
                dataKey="date"
                stroke="#6b7280"
                tick={{ fontSize: 11 }}
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#9ca3af' }}
                formatter={(value: number) => [fmt(value), '']}
              />
              <Area type="monotone" dataKey="totalValue" stroke="#6366f1" fill="url(#pnlGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[300px] items-center justify-center text-gray-500">
            No snapshot data yet. Snapshots are captured daily after market close.
          </div>
        )}
      </div>

      {/* Sector Allocation + Top Movers */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sector Pie */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">Sector Allocation</h2>
          {allocation.length > 0 ? (
            <div className="flex flex-col items-center gap-4 lg:flex-row">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={allocation}
                    dataKey="weight"
                    nameKey="sector"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={50}
                    paddingAngle={2}
                    label={({ sector, weight }: { sector: string; weight: number }) =>
                      `${sector} ${weight.toFixed(1)}%`
                    }
                  >
                    {allocation.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                    formatter={(value: number) => [`${value.toFixed(2)}%`, 'Weight']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[250px] items-center justify-center text-gray-500">
              No holdings to analyze
            </div>
          )}

          {/* Legend table */}
          {allocation.length > 0 && (
            <div className="mt-4 space-y-2">
              {allocation.map((a, i) => (
                <div key={a.sector} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-gray-300">{a.sector}</span>
                  </div>
                  <div className="flex gap-4">
                    <span className="text-gray-400">{a.holdings} stocks</span>
                    <span className="font-medium text-white">{a.weight.toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Movers */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">Top Movers</h2>

          {/* Gainers */}
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-green-400">
            <ArrowUpRight className="h-4 w-4" /> Top Gainers
          </h3>
          {movers.gainers.length > 0 ? (
            <div className="mb-4 space-y-2">
              {movers.gainers.map((m) => (
                <MoverRow key={m.symbol} mover={m} positive />
              ))}
            </div>
          ) : (
            <p className="mb-4 text-sm text-gray-500">No gainers</p>
          )}

          {/* Losers */}
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-red-400">
            <ArrowDownRight className="h-4 w-4" /> Top Losers
          </h3>
          {movers.losers.length > 0 ? (
            <div className="space-y-2">
              {movers.losers.map((m) => (
                <MoverRow key={m.symbol} mover={m} positive={false} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No losers</p>
          )}

          {/* Diversification Bar (if summary available) */}
          {summary && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-medium text-gray-300">Diversification Score</h3>
              <div className="h-4 w-full overflow-hidden rounded-full bg-gray-800">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${summary.diversificationScore}%`,
                    backgroundColor:
                      summary.diversificationScore >= 70
                        ? '#10b981'
                        : summary.diversificationScore >= 40
                        ? '#f59e0b'
                        : '#ef4444',
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {summary.diversificationScore >= 70
                  ? 'Well diversified portfolio'
                  : summary.diversificationScore >= 40
                  ? 'Moderate diversification — consider spreading across more sectors'
                  : 'Concentrated portfolio — high risk'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* P&L Bar Chart (daily change) */}
      {pnlHistory.length > 1 && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="mb-4 text-lg font-semibold text-white">Daily P&L Change</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              data={pnlHistory.map((p, i) => ({
                date: p.date.slice(5),
                change: i > 0 ? p.totalPnl - pnlHistory[i - 1].totalPnl : 0,
              })).slice(1)}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" stroke="#6b7280" tick={{ fontSize: 11 }} />
              <YAxis stroke="#6b7280" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                formatter={(value: number) => [fmt(value), 'Change']}
              />
              <Bar
                dataKey="change"
                fill="#6366f1"
                radius={[4, 4, 0, 0]}
              >
                {pnlHistory.slice(1).map((p, i) => {
                  const change = i > 0 ? p.totalPnl - pnlHistory[i].totalPnl : 0;
                  return <Cell key={i} fill={change >= 0 ? '#10b981' : '#ef4444'} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  positive,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  positive: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-gray-400">{label}</span>
        <span className={positive ? 'text-green-400' : 'text-red-400'}>{icon}</span>
      </div>
      <div className="text-xl font-bold text-white">{value}</div>
      <div className={`mt-1 text-sm ${positive ? 'text-green-400' : 'text-red-400'}`}>{sub}</div>
    </div>
  );
}

function MoverRow({ mover, positive }: { mover: { symbol: string; exchange: string; pnl: number; pnlPercent: number }; positive: boolean }) {
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-800/50 px-3 py-2">
      <div>
        <span className="font-medium text-white">{mover.symbol}</span>
        <span className="ml-2 text-xs text-gray-500">{mover.exchange}</span>
      </div>
      <div className="text-right">
        <span className={`text-sm font-medium ${positive ? 'text-green-400' : 'text-red-400'}`}>
          {fmt(mover.pnl)}
        </span>
        <span className={`ml-2 text-xs ${positive ? 'text-green-400' : 'text-red-400'}`}>
          {mover.pnlPercent >= 0 ? '+' : ''}{mover.pnlPercent.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}
