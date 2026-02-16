import { db } from '../config/database';

export class PortfolioRepository {
  async findOrCreateDefault(userId: string) {
    let portfolio = await db('portfolio.portfolios').where({ user_id: userId }).first();
    if (!portfolio) {
      [portfolio] = await db('portfolio.portfolios').insert({ user_id: userId, name: 'Default' }).returning('*');
    }
    return portfolio;
  }

  async getHoldings(userId: string) {
    return db('portfolio.holdings').where({ user_id: userId });
  }

  async upsertHolding(userId: string, portfolioId: string, data: {
    symbol: string; exchange: string; quantity: number; avgBuyPrice: number; currentPrice?: number;
  }) {
    const existing = await db('portfolio.holdings')
      .where({ user_id: userId, symbol: data.symbol, exchange: data.exchange })
      .first();

    if (existing) {
      const [updated] = await db('portfolio.holdings')
        .where({ id: existing.id })
        .update({
          quantity: data.quantity,
          avg_buy_price: data.avgBuyPrice,
          current_price: data.currentPrice,
          last_synced_at: db.fn.now(),
          updated_at: db.fn.now(),
        })
        .returning('*');
      return updated;
    }

    const [created] = await db('portfolio.holdings')
      .insert({
        portfolio_id: portfolioId,
        user_id: userId,
        symbol: data.symbol,
        exchange: data.exchange,
        quantity: data.quantity,
        avg_buy_price: data.avgBuyPrice,
        current_price: data.currentPrice,
        last_synced_at: db.fn.now(),
      })
      .returning('*');
    return created;
  }

  // Watchlists
  async getWatchlists(userId: string) {
    return db('portfolio.watchlists').where({ user_id: userId });
  }

  async createWatchlist(userId: string, name: string, symbols: unknown[]) {
    const [wl] = await db('portfolio.watchlists')
      .insert({ user_id: userId, name, symbols: JSON.stringify(symbols) })
      .returning('*');
    return wl;
  }

  async updateWatchlist(userId: string, id: string, data: { name?: string; symbols?: unknown[] }) {
    const update: Record<string, unknown> = { updated_at: db.fn.now() };
    if (data.name) update.name = data.name;
    if (data.symbols) update.symbols = JSON.stringify(data.symbols);

    const [wl] = await db('portfolio.watchlists')
      .where({ id, user_id: userId })
      .update(update)
      .returning('*');
    return wl;
  }

  async deleteWatchlist(userId: string, id: string) {
    return db('portfolio.watchlists').where({ id, user_id: userId }).del();
  }
}
