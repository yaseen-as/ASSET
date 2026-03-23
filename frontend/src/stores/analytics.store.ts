import { create } from 'zustand';
import api from '@/lib/api';

export interface PnlDataPoint {
  date: string;
  totalValue: number;
  totalCost: number;
  totalPnl: number;
  pnlPercent: number;
}

export interface SectorAllocation {
  sector: string;
  value: number;
  weight: number;
  holdings: number;
}

export interface Mover {
  symbol: string;
  exchange: string;
  pnl: number;
  pnlPercent: number;
}

export interface AnalyticsSummary {
  diversificationScore: number;
  totalValue: number;
  totalPnl: number;
  pnlPercent: number;
  dayChange: number;
  dayChangePct: number;
  topGainers: Mover[];
  topLosers: Mover[];
  holdingCount: number;
  sectorCount: number;
}

interface AnalyticsState {
  summary: AnalyticsSummary | null;
  pnlHistory: PnlDataPoint[];
  allocation: SectorAllocation[];
  movers: { gainers: Mover[]; losers: Mover[] };
  loading: boolean;
  error: string | null;

  fetchSummary: () => Promise<void>;
  fetchPnlHistory: (period?: string) => Promise<void>;
  fetchAllocation: () => Promise<void>;
  fetchMovers: () => Promise<void>;
  fetchAll: (period?: string) => Promise<void>;
}

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  summary: null,
  pnlHistory: [],
  allocation: [],
  movers: { gainers: [], losers: [] },
  loading: false,
  error: null,

  fetchSummary: async () => {
    try {
      const { data } = await api.get('/portfolio/analytics/summary');
      if (data.success) set({ summary: data.data });
    } catch (err: any) {
      set({ error: err.response?.data?.error || err.message });
    }
  },

  fetchPnlHistory: async (period = '30d') => {
    try {
      const { data } = await api.get(`/portfolio/analytics/pnl?period=${period}`);
      if (data.success) set({ pnlHistory: data.data });
    } catch (err: any) {
      set({ error: err.response?.data?.error || err.message });
    }
  },

  fetchAllocation: async () => {
    try {
      const { data } = await api.get('/portfolio/analytics/allocation');
      if (data.success) set({ allocation: data.data });
    } catch (err: any) {
      set({ error: err.response?.data?.error || err.message });
    }
  },

  fetchMovers: async () => {
    try {
      const { data } = await api.get('/portfolio/analytics/movers');
      if (data.success) set({ movers: data.data });
    } catch (err: any) {
      set({ error: err.response?.data?.error || err.message });
    }
  },

  fetchAll: async (period = '30d') => {
    set({ loading: true, error: null });
    try {
      const [summaryRes, pnlRes, allocRes, moversRes] = await Promise.allSettled([
        api.get('/portfolio/analytics/summary'),
        api.get(`/portfolio/analytics/pnl?period=${period}`),
        api.get('/portfolio/analytics/allocation'),
        api.get('/portfolio/analytics/movers'),
      ]);

      const update: Partial<AnalyticsState> = {};
      if (summaryRes.status === 'fulfilled' && summaryRes.value.data.success)
        update.summary = summaryRes.value.data.data;
      if (pnlRes.status === 'fulfilled' && pnlRes.value.data.success)
        update.pnlHistory = pnlRes.value.data.data;
      if (allocRes.status === 'fulfilled' && allocRes.value.data.success)
        update.allocation = allocRes.value.data.data;
      if (moversRes.status === 'fulfilled' && moversRes.value.data.success)
        update.movers = moversRes.value.data.data;

      set({ ...update, loading: false });
    } catch (err: any) {
      set({ loading: false, error: err.message });
    }
  },
}));
