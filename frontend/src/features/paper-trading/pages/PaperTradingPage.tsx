import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { cn, formatINR, formatPercent } from '@/lib/utils';
import {
  FileText,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  RotateCcw,
  ShoppingCart,
  ToggleLeft,
  ToggleRight,
  Wallet,
  PiggyBank,
  BarChart3,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface PaperBalance {
  cash: number;
  invested: number;
  totalValue: number;
}

interface PaperPosition {
  symbol: string;
  exchange: string;
  quantity: number;
  avgBuyPrice: number;
  currentPrice: number;
  investedValue: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
}

interface PaperOrder {
  id: string;
  symbol: string;
  exchange: string;
  action: string;
  orderType: string;
  quantity: number;
  price: number | null;
  filledQuantity: number;
  avgFillPrice: number | null;
  status: string;
  source: string;
  placedAt: string;
}

function normalize(o: Record<string, unknown>): PaperOrder {
  return {
    id: (o.id || o.order_id) as string,
    symbol: o.symbol as string,
    exchange: o.exchange as string,
    action: o.action as string,
    orderType: (o.orderType || o.order_type) as string,
    quantity: Number(o.quantity),
    price: o.price != null ? Number(o.price) : null,
    filledQuantity: Number(o.filledQuantity ?? o.filled_quantity ?? 0),
    avgFillPrice: o.avgFillPrice != null ? Number(o.avgFillPrice) : o.avg_fill_price != null ? Number(o.avg_fill_price) : null,
    status: o.status as string,
    source: o.source as string,
    placedAt: (o.placedAt || o.placed_at || o.created_at) as string,
  };
}

export default function PaperTradingPage() {
  const navigate = useNavigate();
  const [isPaperMode, setIsPaperMode] = useState(false);
  const [balance, setBalance] = useState<PaperBalance | null>(null);
  const [positions, setPositions] = useState<PaperPosition[]>([]);
  const [orders, setOrders] = useState<PaperOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [profileRes, balRes, posRes, ordersRes] = await Promise.allSettled([
        api.get('/users/profile'),
        api.get('/broker/paper/balance'),
        api.get('/broker/paper/positions'),
        api.get('/broker/orders?source=paper&limit=50'),
      ]);

      if (profileRes.status === 'fulfilled') {
        const p = profileRes.value.data.data;
        setIsPaperMode(p?.paperTrading ?? p?.paper_trading ?? false);
      }
      if (balRes.status === 'fulfilled') {
        setBalance(balRes.value.data.data);
      }
      if (posRes.status === 'fulfilled') {
        setPositions(posRes.value.data.data || []);
      }
      if (ordersRes.status === 'fulfilled') {
        const raw = ordersRes.value.data.data?.orders || ordersRes.value.data.data || [];
        setOrders(raw.map((o: Record<string, unknown>) => normalize(o)));
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  const togglePaperMode = async () => {
    setToggling(true);
    try {
      const newValue = !isPaperMode;
      await api.patch('/users/profile', { paperTrading: newValue });
      setIsPaperMode(newValue);
      toast.success(newValue ? 'Paper trading enabled' : 'Switched to live trading');
      if (newValue) loadAll();
    } catch {
      toast.error('Failed to toggle');
    } finally {
      setToggling(false);
    }
  };

  const resetAccount = async () => {
    if (!confirm('This will delete all paper orders and reset cash to ₹10,00,000. Continue?')) return;
    setResetting(true);
    try {
      await api.post('/broker/paper/reset');
      toast.success('Paper account reset');
      loadAll();
    } catch {
      toast.error('Failed to reset');
    } finally {
      setResetting(false);
    }
  };

  const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0);
  const totalInvested = positions.reduce((sum, p) => sum + p.investedValue, 0);
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-yellow-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Paper Trading</h1>
            <p className="text-sm text-gray-400">Practice trading with virtual money — no real risk</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/orders')}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            <ShoppingCart className="h-4 w-4" />
            Place Trade
          </button>
          <button
            onClick={loadAll}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Paper Mode Toggle */}
      <div className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 p-4">
        <div className="flex items-center gap-3">
          {isPaperMode ? (
            <ToggleRight className="h-8 w-8 text-yellow-400" />
          ) : (
            <ToggleLeft className="h-8 w-8 text-gray-500" />
          )}
          <div>
            <p className="font-medium text-white">
              {isPaperMode ? 'Paper Trading Active' : 'Paper Trading Off'}
            </p>
            <p className="text-sm text-gray-500">
              {isPaperMode
                ? 'All orders from the Orders page are simulated'
                : 'Enable to practice with virtual ₹10,00,000'}
            </p>
          </div>
        </div>
        <button
          onClick={togglePaperMode}
          disabled={toggling}
          className={cn(
            'relative inline-flex h-8 w-14 items-center rounded-full transition-colors',
            isPaperMode ? 'bg-yellow-600' : 'bg-gray-700',
          )}
        >
          <span
            className={cn(
              'inline-block h-6 w-6 transform rounded-full bg-white transition-transform',
              isPaperMode ? 'translate-x-7' : 'translate-x-1',
            )}
          />
        </button>
      </div>

      {!isPaperMode && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-8 text-center">
          <FileText className="mx-auto h-12 w-12 text-gray-600" />
          <p className="mt-3 text-gray-400">Enable paper trading to start practicing</p>
          <button
            onClick={togglePaperMode}
            className="mt-4 rounded-lg bg-yellow-600 px-6 py-2 text-sm font-medium text-white hover:bg-yellow-700"
          >
            Enable Paper Trading
          </button>
        </div>
      )}

      {isPaperMode && (
        <>
          {/* Balance Cards */}
          {balance && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Wallet className="h-4 w-4" /> Cash Available
                </div>
                <p className="mt-2 text-2xl font-bold text-green-400">{formatINR(balance.cash)}</p>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <PiggyBank className="h-4 w-4" /> Invested
                </div>
                <p className="mt-2 text-2xl font-bold text-white">{formatINR(balance.invested)}</p>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <BarChart3 className="h-4 w-4" /> Total Value
                </div>
                <p className="mt-2 text-2xl font-bold text-brand-400">{formatINR(balance.totalValue)}</p>
              </div>
              <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  {totalPnl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  Overall P&L
                </div>
                <p className={cn('mt-2 text-2xl font-bold', totalPnl >= 0 ? 'text-green-400' : 'text-red-400')}>
                  {formatINR(totalPnl)}
                </p>
                <p className={cn('text-sm', totalPnlPct >= 0 ? 'text-green-500' : 'text-red-500')}>
                  {formatPercent(totalPnlPct)}
                </p>
              </div>
            </div>
          )}

          {/* Positions */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Paper Positions</h2>
              <span className="text-sm text-gray-500">{positions.length} stocks</span>
            </div>

            {positions.length === 0 ? (
              <div className="py-8 text-center">
                <ShoppingCart className="mx-auto h-10 w-10 text-gray-600" />
                <p className="mt-2 text-gray-500">No paper positions yet</p>
                <Link
                  to="/orders"
                  className="mt-3 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                >
                  Place Your First Paper Trade
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-left text-gray-400">
                      <th className="pb-2">Symbol</th>
                      <th className="pb-2 text-right">Qty</th>
                      <th className="pb-2 text-right">Avg Price</th>
                      <th className="pb-2 text-right">LTP</th>
                      <th className="pb-2 text-right">Invested</th>
                      <th className="pb-2 text-right">Current</th>
                      <th className="pb-2 text-right">P&L</th>
                      <th className="pb-2 text-right">P&L %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p) => (
                      <tr key={`${p.exchange}:${p.symbol}`} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                        <td className="py-2.5">
                          <span className="font-medium text-white">{p.symbol}</span>
                          <span className="ml-1.5 text-xs text-gray-500">{p.exchange}</span>
                        </td>
                        <td className="py-2.5 text-right">{p.quantity}</td>
                        <td className="py-2.5 text-right font-mono">{formatINR(p.avgBuyPrice)}</td>
                        <td className="py-2.5 text-right font-mono">{formatINR(p.currentPrice)}</td>
                        <td className="py-2.5 text-right">{formatINR(p.investedValue)}</td>
                        <td className="py-2.5 text-right">{formatINR(p.currentValue)}</td>
                        <td className={cn('py-2.5 text-right font-medium', p.pnl >= 0 ? 'text-green-400' : 'text-red-400')}>
                          {formatINR(p.pnl)}
                        </td>
                        <td className={cn('py-2.5 text-right', p.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400')}>
                          {formatPercent(p.pnlPercent)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-700 font-medium">
                      <td className="pt-3 text-gray-300" colSpan={4}>Total</td>
                      <td className="pt-3 text-right">{formatINR(totalInvested)}</td>
                      <td className="pt-3 text-right">{formatINR(totalInvested + totalPnl)}</td>
                      <td className={cn('pt-3 text-right font-bold', totalPnl >= 0 ? 'text-green-400' : 'text-red-400')}>
                        {formatINR(totalPnl)}
                      </td>
                      <td className={cn('pt-3 text-right', totalPnlPct >= 0 ? 'text-green-400' : 'text-red-400')}>
                        {formatPercent(totalPnlPct)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Recent Paper Orders */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Recent Paper Trades</h2>
              <Link to="/orders" className="text-sm text-brand-400 hover:text-brand-300">
                View all orders →
              </Link>
            </div>

            {orders.length === 0 ? (
              <p className="py-4 text-center text-gray-500">No paper trades yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 text-left text-gray-400">
                      <th className="pb-2">Symbol</th>
                      <th className="pb-2">Action</th>
                      <th className="pb-2 text-right">Qty</th>
                      <th className="pb-2 text-right">Fill Price</th>
                      <th className="pb-2 text-right">Value</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.slice(0, 20).map((o) => (
                      <tr key={o.id} className="border-b border-gray-800/50">
                        <td className="py-2.5">
                          <span className="font-medium text-white">{o.symbol}</span>
                          <span className="ml-1.5 text-xs text-gray-500">{o.exchange}</span>
                        </td>
                        <td className="py-2.5">
                          <span className={cn('flex items-center gap-1 font-bold', o.action === 'BUY' ? 'text-green-400' : 'text-red-400')}>
                            {o.action === 'BUY' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                            {o.action}
                          </span>
                        </td>
                        <td className="py-2.5 text-right">{o.filledQuantity || o.quantity}</td>
                        <td className="py-2.5 text-right font-mono">
                          {o.avgFillPrice ? formatINR(o.avgFillPrice) : o.price ? formatINR(o.price) : 'MKT'}
                        </td>
                        <td className="py-2.5 text-right">
                          {o.avgFillPrice
                            ? formatINR(o.avgFillPrice * (o.filledQuantity || o.quantity))
                            : '-'}
                        </td>
                        <td className="py-2.5">
                          <span className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            o.status === 'EXECUTED' ? 'bg-green-900/30 text-green-400' :
                            o.status === 'CANCELLED' ? 'bg-gray-700 text-gray-400' :
                            'bg-blue-900/30 text-blue-400',
                          )}>
                            {o.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-xs text-gray-500">
                          {o.placedAt ? new Date(o.placedAt).toLocaleString('en-IN', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                          }) : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Reset Account */}
          <div className="rounded-xl border border-red-900/30 bg-red-950/20 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-red-400">Reset Paper Account</p>
                <p className="text-sm text-gray-500">
                  Delete all paper trades and reset cash to ₹10,00,000
                </p>
              </div>
              <button
                onClick={resetAccount}
                disabled={resetting}
                className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-900/30 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-900/50 disabled:opacity-50"
              >
                <RotateCcw className={cn('h-4 w-4', resetting && 'animate-spin')} />
                {resetting ? 'Resetting...' : 'Reset Account'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
