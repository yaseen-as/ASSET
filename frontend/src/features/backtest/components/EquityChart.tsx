import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { EquityPoint } from '@/lib/ml-api';

export default function EquityChart({ curve, initial }: { curve: EquityPoint[]; initial: number }) {
  if (curve.length === 0) return null;
  const data = curve.map((p) => ({ date: p.date, equity: p.equity, pnl_pct: (p.equity / initial - 1) * 100 }));
  return (
    <div className="card">
      <h3 className="mb-2 text-sm font-semibold text-gray-300">Equity Curve</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} minTickGap={40} />
          <YAxis
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            width={48}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', fontSize: 12 }}
            formatter={(v: number, name: string) =>
              name === 'pnl_pct' ? [`${v.toFixed(2)}%`, 'P&L'] : [v.toLocaleString('en-IN'), 'Equity']
            }
          />
          <Line type="monotone" dataKey="equity" stroke="#22c55e" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
