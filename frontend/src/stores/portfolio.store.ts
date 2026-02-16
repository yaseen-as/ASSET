import { create } from 'zustand';
import api from '@/lib/api';

export interface Holding {
  symbol: string;
  exchange: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
}

export interface WatchlistItem {
  id: string;
  symbol: string;
  exchange: string;
  ltp: number;
  change: number;
  changePct: number;
}

interface PortfolioState {
  holdings: Holding[];
  watchlists: WatchlistItem[];
  totalValue: number;
  totalPnl: number;
  isLoading: boolean;

  fetchHoldings: () => Promise<void>;
  fetchWatchlists: () => Promise<void>;
  addToWatchlist: (symbol: string, exchange: string) => Promise<void>;
  removeFromWatchlist: (id: string) => Promise<void>;
  syncFromBroker: () => Promise<void>;
}

export const usePortfolioStore = create<PortfolioState>()((set) => ({
  holdings: [],
  watchlists: [],
  totalValue: 0,
  totalPnl: 0,
  isLoading: false,

  fetchHoldings: async () => {
    set({ isLoading: true });
    try {
      const { data } = await api.get('/portfolio/holdings');
      const holdings = data.data.holdings || [];
      const totalValue = holdings.reduce((s: number, h: Holding) => s + h.currentPrice * h.quantity, 0);
      const totalPnl = holdings.reduce((s: number, h: Holding) => s + h.pnl, 0);
      set({ holdings, totalValue, totalPnl });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchWatchlists: async () => {
    set({ isLoading: true });
    try {
      const { data } = await api.get('/portfolio/watchlists');
      set({ watchlists: data.data || [] });
    } finally {
      set({ isLoading: false });
    }
  },

  addToWatchlist: async (symbol, exchange) => {
    await api.post('/portfolio/watchlists', { symbol, exchange });
    // Re-fetch after mutation
    const { data } = await api.get('/portfolio/watchlists');
    set({ watchlists: data.data || [] });
  },

  removeFromWatchlist: async (id) => {
    await api.delete(`/portfolio/watchlists/${id}`);
    set((s) => ({ watchlists: s.watchlists.filter((w) => w.id !== id) }));
  },

  syncFromBroker: async () => {
    set({ isLoading: true });
    try {
      await api.post('/portfolio/sync');
      const { data } = await api.get('/portfolio/holdings');
      const holdings = data.data.holdings || [];
      const totalValue = holdings.reduce((s: number, h: Holding) => s + h.currentPrice * h.quantity, 0);
      const totalPnl = holdings.reduce((s: number, h: Holding) => s + h.pnl, 0);
      set({ holdings, totalValue, totalPnl });
    } finally {
      set({ isLoading: false });
    }
  },
}));
