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

export interface WatchlistSymbol {
  symbol: string;
  exchange: string;
}

export interface Watchlist {
  id: string;
  userId: string;
  name: string;
  symbols: WatchlistSymbol[];
  createdAt: string;
  updatedAt: string;
}

interface PortfolioState {
  holdings: Holding[];
  watchlists: Watchlist[];
  totalValue: number;
  totalPnl: number;
  isLoading: boolean;

  fetchHoldings: () => Promise<void>;
  fetchWatchlists: () => Promise<void>;
  createWatchlist: (name: string, symbols: WatchlistSymbol[]) => Promise<void>;
  addSymbolToWatchlist: (id: string, symbol: string, exchange: string) => Promise<void>;
  removeSymbolFromWatchlist: (id: string, symbol: string) => Promise<void>;
  deleteWatchlist: (id: string) => Promise<void>;
  syncFromBroker: () => Promise<void>;
}

export const usePortfolioStore = create<PortfolioState>()((set, get) => ({
  holdings: [],
  watchlists: [],
  totalValue: 0,
  totalPnl: 0,
  isLoading: false,

  fetchHoldings: async () => {
    set({ isLoading: true });
    try {
      const { data } = await api.get('/portfolio/holdings');
      // Normalize API response: backend uses avgBuyPrice/pnlPercentage, store uses avgPrice/pnlPercent
      const raw = data.data.holdings || [];
      const holdings: Holding[] = raw.map((h: any) => ({
        symbol: h.symbol,
        exchange: h.exchange,
        quantity: h.quantity,
        avgPrice: h.avgBuyPrice ?? h.avgPrice ?? 0,
        currentPrice: h.currentPrice ?? 0,
        pnl: h.pnl ?? 0,
        pnlPercent: h.pnlPercentage ?? h.pnlPercent ?? 0,
      }));
      const totalValue = holdings.reduce((s, h) => s + h.currentPrice * h.quantity, 0);
      const totalPnl = holdings.reduce((s, h) => s + h.pnl, 0);
      set({ holdings, totalValue, totalPnl });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchWatchlists: async () => {
    set({ isLoading: true });
    try {
      const { data } = await api.get('/portfolio/watchlists');
      set({ watchlists: Array.isArray(data.data) ? data.data : [] });
    } finally {
      set({ isLoading: false });
    }
  },

  createWatchlist: async (name, symbols) => {
    const { data } = await api.post('/portfolio/watchlists', { name, symbols });
    set((s) => ({ watchlists: [...s.watchlists, data.data] }));
  },

  addSymbolToWatchlist: async (id, symbol, exchange) => {
    const watchlist = get().watchlists.find((w) => w.id === id);
    if (!watchlist) return;
    const updated = [...watchlist.symbols, { symbol: symbol.toUpperCase(), exchange }];
    const { data } = await api.patch(`/portfolio/watchlists/${id}`, { symbols: updated });
    set((s) => ({
      watchlists: s.watchlists.map((w) => (w.id === id ? data.data : w)),
    }));
  },

  removeSymbolFromWatchlist: async (id, symbol) => {
    const watchlist = get().watchlists.find((w) => w.id === id);
    if (!watchlist) return;
    const updated = watchlist.symbols.filter((s) => s.symbol !== symbol);
    const { data } = await api.patch(`/portfolio/watchlists/${id}`, { symbols: updated });
    set((s) => ({
      watchlists: s.watchlists.map((w) => (w.id === id ? data.data : w)),
    }));
  },

  deleteWatchlist: async (id) => {
    await api.delete(`/portfolio/watchlists/${id}`);
    set((s) => ({ watchlists: s.watchlists.filter((w) => w.id !== id) }));
  },

  syncFromBroker: async () => {
    set({ isLoading: true });
    try {
      await api.post('/portfolio/sync');
      const { data } = await api.get('/portfolio/holdings');
      const raw = data.data.holdings || [];
      const holdings: Holding[] = raw.map((h: any) => ({
        symbol: h.symbol,
        exchange: h.exchange,
        quantity: h.quantity,
        avgPrice: h.avgBuyPrice ?? h.avgPrice ?? 0,
        currentPrice: h.currentPrice ?? 0,
        pnl: h.pnl ?? 0,
        pnlPercent: h.pnlPercentage ?? h.pnlPercent ?? 0,
      }));
      const totalValue = holdings.reduce((s, h) => s + h.currentPrice * h.quantity, 0);
      const totalPnl = holdings.reduce((s, h) => s + h.pnl, 0);
      set({ holdings, totalValue, totalPnl });
    } finally {
      set({ isLoading: false });
    }
  },
}));
