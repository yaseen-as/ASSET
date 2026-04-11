import db from '../config/database';

export interface NotificationRow {
  id: string;
  user_id: string;
  type: 'alert_triggered' | 'recommendation' | 'order_executed' | 'system' | 'info';
  channel: 'in_app' | 'email' | 'push' | 'sms';
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  is_read: boolean;
  read_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PreferencesRow {
  id: string;
  user_id: string;
  email_alerts: boolean;
  email_recommendations: boolean;
  email_orders: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;
}

export class NotificationRepository {
  private table = 'notifications.notifications';
  private prefsTable = 'notifications.preferences';

  async create(data: Partial<NotificationRow>): Promise<NotificationRow> {
    const [row] = await db(this.table).insert(data).returning('*');
    return row;
  }

  async findByUser(userId: string, page: number, pageSize: number): Promise<NotificationRow[]> {
    return db(this.table)
      .where({ user_id: userId })
      .orderBy('created_at', 'desc')
      .limit(pageSize)
      .offset((page - 1) * pageSize);
  }

  async countUnread(userId: string): Promise<number> {
    const [{ count }] = await db(this.table)
      .where({ user_id: userId, is_read: false })
      .count('id as count');
    return parseInt(count as string, 10);
  }

  async markRead(id: string, userId: string): Promise<NotificationRow | undefined> {
    const [row] = await db(this.table)
      .where({ id, user_id: userId })
      .update({ is_read: true, read_at: new Date(), updated_at: new Date() })
      .returning('*');
    return row;
  }

  async markAllRead(userId: string): Promise<number> {
    return db(this.table)
      .where({ user_id: userId, is_read: false })
      .update({ is_read: true, read_at: new Date(), updated_at: new Date() });
  }

  async deleteOlderThan(days: number): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return db(this.table).where('created_at', '<', cutoff).del();
  }

  async getPreferences(userId: string): Promise<PreferencesRow | undefined> {
    return db(this.prefsTable).where({ user_id: userId }).first();
  }

  async upsertPreferences(userId: string, prefs: Partial<PreferencesRow>): Promise<PreferencesRow> {
    const existing = await this.getPreferences(userId);
    if (existing) {
      const [row] = await db(this.prefsTable)
        .where({ user_id: userId })
        .update({ ...prefs, updated_at: new Date() } as any)
        .returning('*');
      return row;
    }
    const [row] = await db(this.prefsTable)
      .insert({ user_id: userId, ...prefs })
      .returning('*');
    return row;
  }
}
