import { engagementDb as db } from '../config/database';

export interface AlertRow {
  id: string;
  user_id: string;
  symbol: string;
  exchange: string;
  condition_type: string;
  threshold: number;
  last_evaluated_value: number | null;
  status: 'active' | 'triggered' | 'disabled' | 'expired';
  trigger_count: number;
  last_triggered_at: Date | null;
  label: string | null;
  note: string | null;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class AlertRepository {
  private table = 'alerts.alerts';

  async create(data: Partial<AlertRow>): Promise<AlertRow> {
    const [row] = await db(this.table).insert(data).returning('*');
    return row;
  }

  async findById(id: string): Promise<AlertRow | undefined> {
    return db(this.table).where({ id }).first();
  }

  async findByUser(userId: string, status?: string): Promise<AlertRow[]> {
    const query = db(this.table).where({ user_id: userId }).orderBy('created_at', 'desc');
    if (status) query.andWhere({ status });
    return query;
  }

  async findActiveBySymbol(symbol: string, exchange: string): Promise<AlertRow[]> {
    return db(this.table).where({ symbol, exchange, status: 'active' });
  }

  async update(id: string, data: Partial<AlertRow>): Promise<AlertRow | undefined> {
    const [row] = await db(this.table)
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    return row;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const count = await db(this.table).where({ id, user_id: userId }).del();
    return count > 0;
  }

  async markTriggered(id: string, evaluatedValue: number): Promise<AlertRow | undefined> {
    const [row] = await db(this.table)
      .where({ id })
      .update({
        status: 'triggered',
        trigger_count: db.raw('trigger_count + 1'),
        last_triggered_at: new Date(),
        last_evaluated_value: evaluatedValue,
        updated_at: new Date(),
      })
      .returning('*');
    return row;
  }

  async expireStale(): Promise<number> {
    return db(this.table)
      .where({ status: 'active' })
      .andWhere('expires_at', '<=', new Date())
      .update({ status: 'expired', updated_at: new Date() });
  }
}
