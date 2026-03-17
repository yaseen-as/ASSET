import { create } from 'zustand';
import api from '@/lib/api';

export interface Order {
  id: string;
  symbol: string;
  exchange: string;
  action: 'BUY' | 'SELL';
  orderType: string;
  productType: string;
  quantity: number;
  price: number | null;
  filledQuantity: number;
  avgFillPrice: number | null;
  status: string;
  source: string;
  rejectionReason: string | null;
  placedAt: string;
  filledAt: string | null;
}

export interface OrderStats {
  placed: number;
  open: number;
  executed: number;
  cancelled: number;
  rejected: number;
}

export interface PlaceOrderDTO {
  connectionId?: string;
  symbol: string;
  exchange: string;
  action: 'BUY' | 'SELL';
  orderType: string;
  quantity: number;
  price?: number;
  productType?: string;
}

interface OrderState {
  orders: Order[];
  stats: OrderStats;
  total: number;
  page: number;
  isLoading: boolean;
  isPlacing: boolean;

  fetchOrders: (page?: number, filters?: { status?: string; source?: string }) => Promise<void>;
  placeOrder: (dto: PlaceOrderDTO) => Promise<{ orderId: string; status: string; message: string }>;
  cancelOrder: (orderId: string) => Promise<void>;
  fetchStats: () => Promise<void>;
}

function normalize(raw: any): Order {
  return {
    id: raw.id,
    symbol: raw.symbol,
    exchange: raw.exchange,
    action: raw.action,
    orderType: raw.order_type ?? raw.orderType,
    productType: raw.product_type ?? raw.productType ?? 'DELIVERY',
    quantity: raw.quantity,
    price: raw.price,
    filledQuantity: raw.filled_quantity ?? raw.filledQuantity ?? 0,
    avgFillPrice: raw.avg_fill_price ?? raw.avgFillPrice ?? null,
    status: raw.status,
    source: raw.source ?? 'live',
    rejectionReason: raw.rejection_reason ?? raw.rejectionReason ?? null,
    placedAt: raw.placed_at ?? raw.placedAt ?? '',
    filledAt: raw.filled_at ?? raw.filledAt ?? null,
  };
}

export const useOrderStore = create<OrderState>()((set) => ({
  orders: [],
  stats: { placed: 0, open: 0, executed: 0, cancelled: 0, rejected: 0 },
  total: 0,
  page: 1,
  isLoading: false,
  isPlacing: false,

  fetchOrders: async (page = 1, filters) => {
    set({ isLoading: true });
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (filters?.status) params.set('status', filters.status);
      if (filters?.source) params.set('source', filters.source);

      const { data } = await api.get(`/broker/orders?${params}`);
      set({
        orders: (data.data || []).map(normalize),
        total: data.meta?.total || 0,
        page,
      });
    } finally {
      set({ isLoading: false });
    }
  },

  placeOrder: async (dto) => {
    set({ isPlacing: true });
    try {
      const { data } = await api.post('/broker/orders', dto);
      return data.data;
    } finally {
      set({ isPlacing: false });
    }
  },

  cancelOrder: async (orderId) => {
    await api.delete(`/broker/orders/${orderId}/cancel`);
    set((s) => ({
      orders: s.orders.map((o) => (o.id === orderId ? { ...o, status: 'CANCELLED' } : o)),
    }));
  },

  fetchStats: async () => {
    try {
      const { data } = await api.get('/broker/orders/stats');
      set({ stats: data.data });
    } catch {
      // ignore
    }
  },
}));
