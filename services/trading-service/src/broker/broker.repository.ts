import { db } from '../config/database';

export interface ConnectionRow {
  id: string;
  user_id: string;
  broker_name: string;
  broker_user_id: string;
  access_token: string | null;
  refresh_token: string | null;
  feed_token: string | null;
  token_expiry: Date | null;
  expires_at: Date | null;
  scopes: string | null;
  is_active: boolean;
  connected_at: Date;
  updated_at: Date;
}

export class BrokerConnectionRepository {
  private table = 'broker.connections';

  async create(data: Partial<ConnectionRow>): Promise<ConnectionRow> {
    const [row] = await db(this.table).insert(data).returning('*');
    return row;
  }

  async upsert(userId: string, brokerName: string, data: Partial<ConnectionRow>): Promise<ConnectionRow> {
    const existing = await this.findByUserIdAndBroker(userId, brokerName);
    if (existing) {
      return this.update(existing.id, data);
    }
    return this.create({ user_id: userId, broker_name: brokerName, ...data });
  }

  async findByUserIdAndBroker(userId: string, brokerName: string): Promise<ConnectionRow | undefined> {
    return db(this.table).where({ user_id: userId, broker_name: brokerName }).first();
  }

  async findById(id: string): Promise<ConnectionRow | undefined> {
    return db(this.table).where({ id }).first();
  }

  async findByUserId(userId: string): Promise<ConnectionRow[]> {
    return db(this.table).where({ user_id: userId });
  }

  async findActiveByUserId(userId: string): Promise<ConnectionRow | undefined> {
    return db(this.table).where({ user_id: userId, is_active: true }).first();
  }

  async update(id: string, data: Partial<ConnectionRow>): Promise<ConnectionRow> {
    const [row] = await db(this.table)
      .where({ id })
      .update({ ...data, updated_at: db.fn.now() })
      .returning('*');
    return row;
  }

  async delete(id: string): Promise<void> {
    await db(this.table).where({ id }).del();
  }

  async findActiveConnections(): Promise<ConnectionRow[]> {
    return db(this.table).where({ is_active: true });
  }
}
