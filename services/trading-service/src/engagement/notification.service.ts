import { NotificationRepository } from './notification.repository';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('NotificationService');

export class NotificationService {
  private repo: NotificationRepository;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.repo = new NotificationRepository();
  }

  async getNotifications(userId: string, page = 1) {
    const [notifications, unreadCount] = await Promise.all([
      this.repo.findByUser(userId, page, config.engagement.pageSize),
      this.repo.countUnread(userId),
    ]);
    return { notifications, unreadCount, page, pageSize: config.engagement.pageSize };
  }

  async markRead(id: string, userId: string) {
    return this.repo.markRead(id, userId);
  }

  async markAllRead(userId: string) {
    const count = await this.repo.markAllRead(userId);
    return { markedRead: count };
  }

  async getPreferences(userId: string) {
    let prefs = await this.repo.getPreferences(userId);
    if (!prefs) {
      prefs = await this.repo.upsertPreferences(userId, {});
    }
    return prefs;
  }

  async updatePreferences(userId: string, data: Record<string, boolean>) {
    return this.repo.upsertPreferences(userId, data);
  }

  async handleAlertTriggered(payload: {
    alertId: string;
    userId: string;
    symbol: string;
    exchange: string;
    conditionType: string;
    threshold: number;
    currentValue: number;
    label?: string;
  }) {
    const title = `Alert Triggered: ${payload.symbol}`;
    const body = payload.label
      ? `${payload.label} — ${payload.conditionType} ${payload.threshold} (current: ${payload.currentValue})`
      : `${payload.symbol} ${payload.conditionType} ${payload.threshold} (current: ${payload.currentValue})`;

    await this.repo.create({
      user_id: payload.userId,
      type: 'alert_triggered',
      channel: 'in_app',
      title,
      body,
      metadata: payload as any,
    });
  }

  startListening(): void {
    // Periodic cleanup of old notifications (> 90 days)
    this.cleanupTimer = setInterval(async () => {
      try {
        const deleted = await this.repo.deleteOlderThan(90);
        if (deleted > 0) logger.info(`Cleaned up ${deleted} old notifications`);
      } catch (err) {
        logger.error('Error cleaning up old notifications', err);
      }
    }, 24 * 60 * 60 * 1000);
  }

  async stop(): Promise<void> {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }
}
