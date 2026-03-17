import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useOrderStore, type PlaceOrderDTO } from '@/stores/order.store';
import { useMarketTicks } from '@/hooks/useMarketTicks';
import SymbolSearch, { type SymbolResult } from '@/components/SymbolSearch';
import { cn, formatINR } from '@/lib/utils';
import api from '@/lib/api';
import {
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  XCircle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_COLORS: Record<string, string> = {
  PLACED: 'bg-blue-900/30 text-blue-400',
  OPEN: 'bg-yellow-900/30 text-yellow-400',
  PARTIALLY_FILLED: 'bg-yellow-900/30 text-yellow-400',
  EXECUTED: 'bg-green-900/30 text-green-400',
  CANCELLED: 'bg-gray-700 text-gray-400',
  REJECTED: 'bg-red-900/30 text-red-400',
  AMO_SUBMITTED: 'bg-purple-900/30 text-purple-400',
};

export default function OrderPage() {
  const [searchParams] = useSearchParams();
  const { orders, stats, total, page, isLoading, isPlacing, fetchOrders, placeOrder, cancelOrder, fetchStats } = useOrderStore();

  // Order form state
  const [symbol, setSymbol] = useState(searchParams.get('symbol') || '');
  const [exchange, setExchange] = useState(searchParams.get('exchange') || 'NSE');
  const [action, setAction] = useState<'BUY' | 'SELL'>((searchParams.get('action') as 'BUY' | 'SELL') || 'BUY');
  const [orderType, setOrderType] = useState('MARKET');
  const [productType, setProductType] = useState('DELIVERY');
  const [quantity, setQuantity] = useState(searchParams.get('qty') || '1');
  const [price, setPrice] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [paperBalance, setPaperBalance] = useState<{ cash: number; invested: number; totalValue: number } | null>(null);
  const [isPaperMode, setIsPaperMode] = useState(false);
  const [connectionId, setConnectionId] = useState('');

  // Live tick for selected symbol
  const tickSymbols = useMemo(() => (symbol && exchange ? [`${exchange}:${symbol}`] : []), [symbol, exchange]);
  const { ticks } = useMarketTicks(tickSymbols);
  const currentTick = symbol && exchange ? ticks[`${exchange}:${symbol}`] : null;

  useEffect(() => {
    fetchOrders(1);
    fetchStats();
    loadTradingMode();
    loadConnection();
  }, []);

  const loadTradingMode = async () => {
    try {
      const { data } = await api.get('/users/profile');
      const p = data.data;
      setIsPaperMode(p?.paperTrading ?? p?.paper_trading ?? false);
      if (p?.paperTrading || p?.paper_trading) {
        const { data: bal } = await api.get('/broker/paper/balance');
        setPaperBalance(bal.data);
      }
    } catch { /* ignore */ }
  };

  const loadConnection = async () => {
    try {
      const { data } = await api.get('/broker/connections');
      const active = (data.data || []).find((c: any) => c.isActive || c.is_active);
      if (active) setConnectionId(active.id);
    } catch { /* ignore */ }
  };

  const handleSymbolSelect = (result: SymbolResult) => {
    setSymbol(result.symbol);
    setExchange(result.exchange);
  };

  const estimatedCost = useMemo(() => {
    const ltp = currentTick?.ltp || parseFloat(price) || 0;
    const qty = parseInt(quantity) || 0;
    return ltp * qty;
  }, [currentTick, price, quantity]);

  const handlePlaceOrder = async () => {
    setShowConfirm(false);
    if (!symbol || !quantity) {
      toast.error('Fill in symbol and quantity');
      return;
    }

    const dto: PlaceOrderDTO = {
      symbol,
      exchange: exchange as any,
      action,
      orderType,
      quantity: parseInt(quantity),
      productType,
    };
    if (!isPaperMode && connectionId) {
      dto.connectionId = connectionId;
    }
    if (orderType !== 'MARKET' && price) {
      dto.price = parseFloat(price);
    }

    try {
      const result = await placeOrder(dto);
      toast.success(result.message || `Order ${result.status}`);
      fetchOrders(1);
      fetchStats();
      if (isPaperMode) loadTradingMode(); // refresh balance
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || err.response?.data?.message || 'Order failed');
    }
  };

  const handleCancel = async (orderId: string) => {
    try {
      await cancelOrder(orderId);
      toast.success('Order cancelled');
      fetchStats();
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message || 'Cancel failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ShoppingCart className="h-6 w-6 text-brand-400" />
        <h1 className="text-2xl font-bold">Orders</h1>
        {isPaperMode && (
          <span className="ml-2 rounded-full bg-yellow-900/30 px-3 py-1 text-xs font-medium text-yellow-400">
            Paper Trading
          </span>
        )}
      </div>

      {/* Paper balance */}
      {isPaperMode && paperBalance && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card text-center">
            <p className="text-xs text-gray-500">Cash Available</p>
            <p className="mt-1 text-lg font-bold text-green-400">{formatINR(paperBalance.cash)}</p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-gray-500">Invested</p>
            <p className="mt-1 text-lg font-bold">{formatINR(paperBalance.invested)}</p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-gray-500">Total Value</p>
            <p className="mt-1 text-lg font-bold text-brand-400">{formatINR(paperBalance.totalValue)}</p>
          </div>
        </div>
      )}

      {/* Order Form */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold">Place Order</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Symbol search */}
          <div className="lg:col-span-2">
            <label className="label">Symbol</label>
            <SymbolSearch
              onSelect={handleSymbolSelect}
              defaultValue={symbol ? `${exchange}:${symbol}` : ''}
              placeholder="Search RELIANCE, INFY, TCS..."
            />
          </div>

          {/* LTP display */}
          <div>
            <label className="label">Last Price</label>
            <div className="flex h-10 items-center rounded-lg border border-gray-700 bg-gray-800/50 px-3">
              {currentTick ? (
                <span className="font-mono text-lg font-bold">{formatINR(currentTick.ltp)}</span>
              ) : (
                <span className="text-gray-500">--</span>
              )}
              {currentTick && (
                <span className={cn('ml-2 text-sm', currentTick.change >= 0 ? 'text-green-400' : 'text-red-400')}>
                  {currentTick.change >= 0 ? '+' : ''}{currentTick.changePercent.toFixed(2)}%
                </span>
              )}
            </div>
          </div>

          {/* Action */}
          <div>
            <label className="label">Action</label>
            <div className="flex gap-1 rounded-lg border border-gray-700 p-1">
              {(['BUY', 'SELL'] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setAction(a)}
                  className={cn(
                    'flex-1 rounded-md px-3 py-1.5 text-sm font-bold transition-colors',
                    action === a
                      ? a === 'BUY'
                        ? 'bg-green-600 text-white'
                        : 'bg-red-600 text-white'
                      : 'text-gray-400 hover:text-gray-200',
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Order Type */}
          <div>
            <label className="label">Order Type</label>
            <select className="input" value={orderType} onChange={(e) => setOrderType(e.target.value)}>
              <option value="MARKET">Market</option>
              <option value="LIMIT">Limit</option>
              <option value="SL">Stop Loss</option>
              <option value="SL-M">SL-Market</option>
            </select>
          </div>

          {/* Product Type */}
          <div>
            <label className="label">Product</label>
            <select className="input" value={productType} onChange={(e) => setProductType(e.target.value)}>
              <option value="DELIVERY">Delivery</option>
              <option value="INTRADAY">Intraday</option>
            </select>
          </div>

          {/* Quantity */}
          <div>
            <label className="label">Quantity</label>
            <input
              className="input"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          {/* Price (for LIMIT/SL) */}
          {orderType !== 'MARKET' && (
            <div>
              <label className="label">Price</label>
              <input
                className="input"
                type="number"
                step="0.05"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Limit price"
              />
            </div>
          )}
        </div>

        {/* Estimated cost */}
        {estimatedCost > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-gray-800/50 px-4 py-2 text-sm">
            <span className="text-gray-400">Estimated {action === 'BUY' ? 'Cost' : 'Proceeds'}</span>
            <span className="font-bold">{formatINR(estimatedCost)}</span>
          </div>
        )}

        {/* Place button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowConfirm(true)}
            disabled={isPlacing || !symbol || !quantity}
            className={cn(
              'rounded-lg px-6 py-2.5 font-bold text-white transition-colors disabled:opacity-50',
              action === 'BUY' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700',
            )}
          >
            {isPlacing ? 'Placing...' : `${action} ${symbol || 'Symbol'}`}
          </button>
          {!isPaperMode && !connectionId && (
            <span className="flex items-center gap-1 text-sm text-yellow-400">
              <AlertTriangle className="h-4 w-4" />
              No broker connected
            </span>
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold">Confirm Order</h3>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Symbol</span>
                <span className="font-medium">{exchange}:{symbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Action</span>
                <span className={cn('font-bold', action === 'BUY' ? 'text-green-400' : 'text-red-400')}>{action}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Type</span>
                <span>{orderType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Quantity</span>
                <span>{quantity}</span>
              </div>
              {orderType !== 'MARKET' && price && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Price</span>
                  <span>{formatINR(parseFloat(price))}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-800 pt-2">
                <span className="text-gray-400">Est. Value</span>
                <span className="font-bold">{formatINR(estimatedCost)}</span>
              </div>
              {isPaperMode && (
                <div className="mt-2 rounded-lg bg-yellow-900/20 px-3 py-2 text-xs text-yellow-400">
                  This is a paper trade — no real money will be used.
                </div>
              )}
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setShowConfirm(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={handlePlaceOrder}
                className={cn(
                  'flex-1 rounded-lg px-4 py-2 font-bold text-white',
                  action === 'BUY' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700',
                )}
              >
                Confirm {action}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Order Stats */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Placed', value: stats.placed, color: 'text-blue-400' },
          { label: 'Open', value: stats.open, color: 'text-yellow-400' },
          { label: 'Executed', value: stats.executed, color: 'text-green-400' },
          { label: 'Cancelled', value: stats.cancelled, color: 'text-gray-400' },
          { label: 'Rejected', value: stats.rejected, color: 'text-red-400' },
        ].map((s) => (
          <div key={s.label} className="card text-center">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={cn('mt-1 text-xl font-bold', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Order History */}
      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Order History</h2>
          <div className="flex items-center gap-2">
            <select
              className="input w-auto text-sm"
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); fetchOrders(1, { status: e.target.value || undefined }); }}
            >
              <option value="">All Status</option>
              <option value="PLACED">Placed</option>
              <option value="OPEN">Open</option>
              <option value="EXECUTED">Executed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="REJECTED">Rejected</option>
            </select>
            <button
              onClick={() => { fetchOrders(page, { status: filterStatus || undefined }); fetchStats(); }}
              disabled={isLoading}
              className="btn-secondary p-2"
            >
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            </button>
          </div>
        </div>

        {orders.length === 0 ? (
          <p className="py-8 text-center text-gray-500">No orders yet. Place your first order above.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-left text-gray-400">
                    <th className="pb-2">Symbol</th>
                    <th className="pb-2">Action</th>
                    <th className="pb-2 text-right">Qty</th>
                    <th className="pb-2 text-right">Price</th>
                    <th className="pb-2 text-right">Filled</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Time</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-gray-800/50">
                      <td className="py-2.5">
                        <span className="font-medium">{o.symbol}</span>
                        <span className="ml-1.5 text-xs text-gray-500">{o.exchange}</span>
                        {o.source === 'paper' && (
                          <span className="ml-1.5 text-xs text-yellow-500">paper</span>
                        )}
                      </td>
                      <td className="py-2.5">
                        <span className={cn('flex items-center gap-1 font-bold', o.action === 'BUY' ? 'text-green-400' : 'text-red-400')}>
                          {o.action === 'BUY' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {o.action}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">{o.quantity}</td>
                      <td className="py-2.5 text-right font-mono">
                        {o.orderType === 'MARKET' ? 'MKT' : formatINR(o.price || 0)}
                      </td>
                      <td className="py-2.5 text-right">
                        {o.filledQuantity > 0 && (
                          <span>
                            {o.filledQuantity} @ {formatINR(o.avgFillPrice || 0)}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5">
                        <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_COLORS[o.status] || 'bg-gray-700 text-gray-400')}>
                          {o.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-xs text-gray-500">
                        {o.placedAt ? new Date(o.placedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                      </td>
                      <td className="py-2.5">
                        {['PLACED', 'OPEN', 'AMO_SUBMITTED'].includes(o.status) && (
                          <button
                            onClick={() => handleCancel(o.id)}
                            className="text-gray-500 hover:text-red-400"
                            title="Cancel"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {total > 20 && (
              <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
                <span>Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, total)} of {total}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => fetchOrders(page - 1, { status: filterStatus || undefined })}
                    disabled={page <= 1}
                    className="rounded p-1 hover:bg-gray-800 disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => fetchOrders(page + 1, { status: filterStatus || undefined })}
                    disabled={page * 20 >= total}
                    className="rounded p-1 hover:bg-gray-800 disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
