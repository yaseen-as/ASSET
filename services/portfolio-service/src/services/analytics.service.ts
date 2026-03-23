import { SnapshotRepository } from '../repositories/snapshot.repository';
import { SectorService } from './sector.service';
import { PortfolioService } from './portfolio.service';

export interface PnlDataPoint {
  date: string;
  totalValue: number;
  totalCost: number;
  totalPnl: number;
  pnlPercent: number;
}

export interface AnalyticsSummary {
  diversificationScore: number;
  totalValue: number;
  totalPnl: number;
  pnlPercent: number;
  dayChange: number;
  dayChangePct: number;
  topGainers: { symbol: string; exchange: string; pnl: number; pnlPercent: number }[];
  topLosers: { symbol: string; exchange: string; pnl: number; pnlPercent: number }[];
  holdingCount: number;
  sectorCount: number;
}

export class AnalyticsService {
  private snapshotRepo = new SnapshotRepository();
  private sectorService = new SectorService();
  private portfolioService = new PortfolioService();

  async getPnlHistory(userId: string, period: string): Promise<PnlDataPoint[]> {
    const days = this.periodToDays(period);
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);

    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];

    const snapshots = await this.snapshotRepo.findByUserAndDateRange(userId, fromStr, toStr);

    return snapshots.map(s => ({
      date: typeof s.date === 'string' ? s.date : new Date(s.date).toISOString().split('T')[0],
      totalValue: Number(s.total_value),
      totalCost: Number(s.total_cost),
      totalPnl: Number(s.total_pnl),
      pnlPercent: Number(s.pnl_percent),
    }));
  }

  async getSectorAllocation(userId: string) {
    const portfolio = await this.portfolioService.getHoldings(userId);
    const holdings = portfolio.holdings.map(h => ({
      symbol: h.symbol,
      exchange: h.exchange,
      currentPrice: h.currentPrice,
      quantity: h.quantity,
    }));
    return this.sectorService.getSectorAllocation(holdings);
  }

  async getTopMovers(userId: string) {
    const portfolio = await this.portfolioService.getHoldings(userId);
    const sorted = [...portfolio.holdings].sort((a, b) => b.pnlPercentage - a.pnlPercentage);

    const gainers = sorted
      .filter(h => h.pnl > 0)
      .slice(0, 3)
      .map(h => ({ symbol: h.symbol, exchange: h.exchange, pnl: h.pnl, pnlPercent: h.pnlPercentage }));

    const losers = sorted
      .filter(h => h.pnl < 0)
      .reverse()
      .slice(0, 3)
      .map(h => ({ symbol: h.symbol, exchange: h.exchange, pnl: h.pnl, pnlPercent: h.pnlPercentage }));

    return { gainers, losers };
  }

  async getAnalyticsSummary(userId: string): Promise<AnalyticsSummary> {
    const portfolio = await this.portfolioService.getHoldings(userId);
    const { totalValue, totalPnl, pnlPercentage, holdings } = portfolio;

    // Sector allocation
    const holdingsForSector = holdings.map(h => ({
      symbol: h.symbol,
      exchange: h.exchange,
      currentPrice: h.currentPrice,
      quantity: h.quantity,
    }));
    const allocation = await this.sectorService.getSectorAllocation(holdingsForSector);

    // Holding weights for diversification
    const holdingWeights = totalValue > 0
      ? holdings.map(h => (h.currentPrice * h.quantity) / totalValue)
      : [];
    const diversificationScore = this.sectorService.getDiversificationScore(allocation, holdingWeights);

    // Day change from latest snapshot
    let dayChange = 0;
    let dayChangePct = 0;
    const latestSnapshots = await this.snapshotRepo.findLatest(userId, 2);
    if (latestSnapshots.length >= 2) {
      const today = Number(latestSnapshots[0].total_value);
      const yesterday = Number(latestSnapshots[1].total_value);
      dayChange = Math.round((today - yesterday) * 100) / 100;
      dayChangePct = yesterday > 0
        ? Math.round(((today - yesterday) / yesterday) * 10000) / 100
        : 0;
    }

    // Top movers
    const sorted = [...holdings].sort((a, b) => b.pnlPercentage - a.pnlPercentage);
    const topGainers = sorted
      .filter(h => h.pnl > 0)
      .slice(0, 3)
      .map(h => ({ symbol: h.symbol, exchange: h.exchange, pnl: h.pnl, pnlPercent: h.pnlPercentage }));
    const topLosers = sorted
      .filter(h => h.pnl < 0)
      .reverse()
      .slice(0, 3)
      .map(h => ({ symbol: h.symbol, exchange: h.exchange, pnl: h.pnl, pnlPercent: h.pnlPercentage }));

    return {
      diversificationScore,
      totalValue,
      totalPnl,
      pnlPercent: pnlPercentage,
      dayChange,
      dayChangePct,
      topGainers,
      topLosers,
      holdingCount: holdings.length,
      sectorCount: allocation.length,
    };
  }

  async getSnapshots(userId: string, from: string, to: string) {
    return this.snapshotRepo.findByUserAndDateRange(userId, from, to);
  }

  private periodToDays(period: string): number {
    switch (period) {
      case '7d': return 7;
      case '30d': return 30;
      case '90d': return 90;
      case '1y': return 365;
      default: return 30;
    }
  }
}
