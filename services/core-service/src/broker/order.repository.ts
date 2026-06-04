import { db } from '../config/database';

export interface OrderRow {
  id: string;
  user_id: string;
  connection_id: string | null;
  broker_order_id: string | null;
  symbol: string;
  exchange: string;
  action: string;
  order_type: string;
  product_type: string;
  quantity: number;
  price: number | null;
  trigger_price: number | null;
  filled_quantity: number;
  avg_fill_price: number | null;
  status: string;
  source: string;
  rejection_reason: string | null;
  placed_at: Date;
  updated_at: Date;
  filled_at: Date | null;
}

export interface CreateOrderDTO {
  user_id: string;
  connection_id?: string;
  broker_order_id?: string;
  symbol: string;
  exchange: string;
  action: string;
  order_type: string;
  product_type: string;
  quantity: number;
  price?: number;
  trigger_price?: number;
  status: string;
  source: string;
}

export interface OrderStatusUpdate {
  status: string;
  filled_quantity?: number;
  avg_fill_price?: number;
  filled_at?: Date;
  rejection_reason?: string;
}

export interface OrderStats {
  placed: number;
  open: number;
  executed: number;
  cancelled: number;
  rejected: number;
}

export class OrderRepository {
  private table = 'core.order_history';

  async create(data: CreateOrderDTO): Promise<OrderRow> {
    const [row] = await db(this.table).insert(data).returning('*');
    return row;
  }

  async findById(id: string): Promise<OrderRow | undefined> {
    return db(this.table).where({ id }).first();
  }

  async findByUserId(userId: string, limit = 20, offset = 0): Promise<OrderRow[]> {
    return db(this.table)
      .where({ user_id: userId })
      .orderBy('placed_at', 'desc')
      .limit(limit)
      .offset(offset);
  }

  async findByUserIdFiltered(userId: string, filters: { status?: string; source?: string }, limit = 20, offset = 0): Promise<OrderRow[]> {
    let q = db(this.table).where({ user_id: userId });
    if (filters.status) q = q.andWhere('status', filters.status);
    if (filters.source) q = q.andWhere('source', filters.source);
    return q.orderBy('placed_at', 'desc').limit(limit).offset(offset);
  }

  async countByUserId(userId: string, filters?: { status?: string; source?: string }): Promise<number> {
    let q = db(this.table).where({ user_id: userId });
    if (filters?.status) q = q.andWhere('status', filters.status);
    if (filters?.source) q = q.andWhere('source', filters.source);
    const [{ count }] = await q.count('* as count');
    return Number(count);
  }

  async findPendingOrders(): Promise<OrderRow[]> {
    return db(this.table)
      .whereIn('status', ['PLACED', 'OPEN', 'PARTIALLY_FILLED', 'AMO_SUBMITTED'])
      .andWhere('source', 'live')
      .orderBy('placed_at', 'asc');
  }

  async updateStatus(id: string, update: OrderStatusUpdate): Promise<OrderRow> {
    const [row] = await db(this.table)
      .where({ id })
      .update({ ...update, updated_at: db.fn.now() })
      .returning('*');
    return row;
  }

  async getStats(userId: string): Promise<OrderStats> {
    const rows = await db(this.table)
      .where({ user_id: userId })
      .select('status')
      .count('* as count')
      .groupBy('status');

    const stats: OrderStats = { placed: 0, open: 0, executed: 0, cancelled: 0, rejected: 0 };
    for (const r of rows) {
      const s = (r.status as string).toLowerCase();
      const c = Number(r.count);
      if (s === 'placed') stats.placed = c;
      else if (s === 'open' || s === 'partially_filled' || s === 'amo_submitted') stats.open += c;
      else if (s === 'executed') stats.executed = c;
      else if (s === 'cancelled') stats.cancelled = c;
      else if (s === 'rejected') stats.rejected = c;
    }
    return stats;
  }

  async deleteByUserAndSource(userId: string, source: string): Promise<number> {
    return db(this.table).where({ user_id: userId, source }).del();
  }
}
