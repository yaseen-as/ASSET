import axios from 'axios';
import { PortfolioRepository } from '../repositories/portfolio.repository';
import { config } from '../config';
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

    // Refresh current prices from market-data-service
    for (const h of holdings) {
      try {
        const { data } = await axios.get(
          `${config.marketDataServiceUrl}/api/v1/market/quote/${h.exchange}/${h.symbol}`,
          { timeout: 3000 },
        );
        if (data.data?.ltp) {
          h.currentPrice = data.data.ltp;
          h.pnl = Math.round((h.currentPrice - h.avgBuyPrice) * h.quantity * 100) / 100;
          h.pnlPercentage = h.avgBuyPrice > 0
            ? Math.round(((h.currentPrice - h.avgBuyPrice) / h.avgBuyPrice) * 10000) / 100
            : 0;
        }
      } catch {
        // Use cached price
      }
    }

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

  async syncFromBroker(userId: string): Promise<{ synced: number }> {
    // 1. Get user's active broker connections
    const { data: connResponse } = await axios.get(
      `${config.brokerServiceUrl}/api/v1/broker/connections`,
      { headers: { 'x-user-id': userId }, timeout: 5000 },
    );

    const connections = connResponse.data || [];
    if (connections.length === 0) {
      throw new Error('No broker connected. Connect a broker first.');
    }

    let totalSynced = 0;

    for (const conn of connections) {
      if (!conn.isActive && !conn.is_active) continue;

      // 2. Fetch holdings from broker service
      const { data: holdingsResponse } = await axios.get(
        `${config.brokerServiceUrl}/api/v1/broker/holdings/${conn.id}`,
        { headers: { 'x-user-id': userId }, timeout: 10000 },
      );

      const brokerHoldings = holdingsResponse.data || [];
      if (brokerHoldings.length === 0) continue;

      // 3. Get or create default portfolio
      const portfolio = await this.repo.findOrCreateDefault(userId);

      // 4. Map Angel One holdings → our schema and upsert
      for (const h of brokerHoldings) {
        const symbol = this.extractSymbol(h.tradingsymbol || h.symbol || '');
        if (!symbol) continue;

        await this.repo.upsertHolding(userId, portfolio.id, {
          symbol,
          exchange: h.exchange || 'NSE',
          quantity: parseInt(h.quantity || h.t1quantity || '0', 10),
          avgBuyPrice: parseFloat(h.averageprice || h.avgBuyPrice || '0'),
          currentPrice: parseFloat(h.ltp || h.close || h.averageprice || '0'),
        });
        totalSynced++;
      }
    }

    return { synced: totalSynced };
  }

  private extractSymbol(tradingSymbol: string): string {
    // Angel One format: "RELIANCE-EQ" → "RELIANCE"
    return tradingSymbol.replace(/-EQ$/i, '').trim();
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
