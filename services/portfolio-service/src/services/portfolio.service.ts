import { PortfolioRepository } from '../repositories/portfolio.repository';
import type { PortfolioSummary, Holding, Watchlist, CreateWatchlistDTO, UpdateWatchlistDTO } from '@platform/shared';

export class PortfolioService {
  private repo = new PortfolioRepository();

  async getHoldings(userId: string): Promise<PortfolioSummary> {
    const portfolio = await this.repo.findOrCreateDefault(userId);
    const rows = await this.repo.getHoldings(userId);

    const holdings: Holding[] = rows.map((r: Record<string, unknown>) => {
      const qty = Number(r.quantity);
      const avg = Number(r.avg_buy_price);
      const current = Number(r.current_price || avg);
      const pnl = (current - avg) * qty;
      const pnlPct = avg > 0 ? ((current - avg) / avg) * 100 : 0;

      return {
        id: r.id as string,
        portfolioId: r.portfolio_id as string,
        userId: r.user_id as string,
        symbol: r.symbol as string,
        exchange: r.exchange as Holding['exchange'],
        quantity: qty,
        avgBuyPrice: avg,
        currentPrice: current,
        pnl: Math.round(pnl * 100) / 100,
        pnlPercentage: Math.round(pnlPct * 100) / 100,
        lastSyncedAt: r.last_synced_at as Date,
        createdAt: r.created_at as Date,
        updatedAt: r.updated_at as Date,
      };
    });

    const totalValue = holdings.reduce((sum, h) => sum + h.currentPrice * h.quantity, 0);
    const totalInvested = holdings.reduce((sum, h) => sum + h.avgBuyPrice * h.quantity, 0);
    const totalPnl = totalValue - totalInvested;
    const pnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

    return {
      portfolioId: portfolio.id as string,
      totalValue: Math.round(totalValue * 100) / 100,
      totalPnl: Math.round(totalPnl * 100) / 100,
      pnlPercentage: Math.round(pnlPct * 100) / 100,
      holdings,
    };
  }

  async syncFromBroker(userId: string): Promise<void> {
    // This would call Broker Service to get holdings and upsert them
    // For now, it's a placeholder
    console.log(`Syncing portfolio for user ${userId} from broker...`);
  }

  async getWatchlists(userId: string): Promise<Watchlist[]> {
    const rows = await this.repo.getWatchlists(userId);
    return rows.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      userId: r.user_id as string,
      name: r.name as string,
      symbols: r.symbols as Watchlist['symbols'],
      createdAt: r.created_at as Date,
      updatedAt: r.updated_at as Date,
    }));
  }

  async createWatchlist(userId: string, dto: CreateWatchlistDTO): Promise<Watchlist> {
    const row = await this.repo.createWatchlist(userId, dto.name, dto.symbols);
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      symbols: row.symbols,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async updateWatchlist(userId: string, id: string, dto: UpdateWatchlistDTO): Promise<Watchlist> {
    const row = await this.repo.updateWatchlist(userId, id, { name: dto.name, symbols: dto.symbols });
    if (!row) throw new Error('Watchlist not found');
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      symbols: row.symbols,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async deleteWatchlist(userId: string, id: string): Promise<void> {
    await this.repo.deleteWatchlist(userId, id);
  }
}
