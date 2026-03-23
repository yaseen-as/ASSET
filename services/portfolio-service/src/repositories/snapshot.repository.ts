import { db } from '../config/database';

export interface SnapshotRow {
  id: string;
  user_id: string;
  date: string;
  total_value: number;
  total_cost: number;
  total_pnl: number;
  pnl_percent: number;
  holdings: unknown;
  created_at: Date;
}

export class SnapshotRepository {
  async create(data: {
    user_id: string;
    date: string;
    total_value: number;
    total_cost: number;
    total_pnl: number;
    pnl_percent: number;
    holdings: unknown;
  }): Promise<SnapshotRow> {
    const [row] = await db('portfolio.snapshots')
      .insert({
        user_id: data.user_id,
        date: data.date,
        total_value: data.total_value,
        total_cost: data.total_cost,
        total_pnl: data.total_pnl,
        pnl_percent: data.pnl_percent,
        holdings: JSON.stringify(data.holdings),
      })
      .onConflict(['user_id', 'date'])
      .ignore()
      .returning('*');
    return row;
  }

  async findByUserAndDateRange(
    userId: string,
    from: string,
    to: string,
  ): Promise<SnapshotRow[]> {
    return db('portfolio.snapshots')
      .where('user_id', userId)
      .whereBetween('date', [from, to])
      .orderBy('date', 'asc');
  }

  async findLatest(userId: string, limit: number = 1): Promise<SnapshotRow[]> {
    return db('portfolio.snapshots')
      .where('user_id', userId)
      .orderBy('date', 'desc')
      .limit(limit);
  }

  async existsForDate(userId: string, date: string): Promise<boolean> {
    const row = await db('portfolio.snapshots')
      .where({ user_id: userId, date })
      .first();
    return !!row;
  }

  async getAllUserIds(): Promise<string[]> {
    const rows = await db('portfolio.holdings')
      .distinct('user_id')
      .where('quantity', '>', 0);
    return rows.map((r: { user_id: string }) => r.user_id);
  }
}
