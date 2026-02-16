// ─── Portfolio Types ───

import { Exchange } from './broker.types';

export interface Portfolio {
  id: string;
  userId: string;
  name: string;
  createdAt: Date;
}

export interface Holding {
  id: string;
  portfolioId: string;
  userId: string;
  symbol: string;
  exchange: Exchange;
  quantity: number;
  avgBuyPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercentage: number;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PortfolioSummary {
  portfolioId: string;
  totalValue: number;
  totalPnl: number;
  pnlPercentage: number;
  holdings: Holding[];
}

export interface Watchlist {
  id: string;
  userId: string;
  name: string;
  symbols: WatchlistSymbol[];
  createdAt: Date;
  updatedAt: Date;
}

export interface WatchlistSymbol {
  symbol: string;
  exchange: Exchange;
}

export interface CreateWatchlistDTO {
  name: string;
  symbols: WatchlistSymbol[];
}

export interface UpdateWatchlistDTO {
  name?: string;
  symbols?: WatchlistSymbol[];
}
