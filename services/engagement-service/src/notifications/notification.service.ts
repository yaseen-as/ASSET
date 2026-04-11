import Redis from 'ioredis';
import { NotificationRepository } from './notification.repository';
import { WsNotifier } from '../services/ws-notifier';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('NotificationService');

export class NotificationService {
  private repo: NotificationRepository;
  private redisSub: Redis;
  private wsNotifier: WsNotifier;

  constructor(wsNotifier: WsNotifier) {
    this.repo = new NotificationRepository();
    this.wsNotifier = wsNotifier;
    this.redisSub = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
    });
  }

  /* ─── CRUD (called by controllers) ────────────────────── */

  async getNotifications(userId: string, page = 1) {
    const [notifications, unreadCount] = await Promise.all([
      this.repo.findByUser(userId, page, config.pageSize),
      this.repo.countUnread(userId),
    ]);
    return { notifications, unreadCount, page, pageSize: config.pageSize };
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

  /* ─── Event handlers (called directly by evaluation engine + Redis) ── */

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

    const notification = await this.repo.create({
      user_id: payload.userId,
      type: 'alert_triggered',
      channel: 'in_app',
      title,
      body,
      metadata: payload as any,
    });

    this.wsNotifier.push(payload.userId, { event: 'notification', data: notification });

    const prefs = await this.repo.getPreferences(payload.userId);
    if (!prefs || prefs.email_alerts) {
      logger.info(`Would send alert email to user ${payload.userId}`);
    }
  }

  async handleNewRecommendation(payload: {
    userId: string;
    symbol: string;
    action: string;
    confidence: number;
  }) {
    const title = `New Recommendation: ${payload.action} ${payload.symbol}`;
    const body = `Confidence: ${(payload.confidence * 100).toFixed(0)}%`;

    const notification = await this.repo.create({
      user_id: payload.userId,
      type: 'recommendation',
      channel: 'in_app',
      title,
      body,
      metadata: payload as any,
    });

    this.wsNotifier.push(payload.userId, { event: 'notification', data: notification });
  }

  async handleOrderExecuted(payload: {
    userId: string;
    symbol: string;
    side: string;
    quantity: number;
    price: number;
    orderId: string;
  }) {
    const title = `Order Executed: ${payload.side} ${payload.symbol}`;
    const body = `${payload.quantity} shares @ ₹${payload.price}`;

    const notification = await this.repo.create({
      user_id: payload.userId,
      type: 'order_executed',
      channel: 'in_app',
      title,
      body,
      metadata: payload as any,
    });

    this.wsNotifier.push(payload.userId, { event: 'notification', data: notification });
  }

  /* ─── External event listener (Redis channels from other services) ── */

  startListening(): void {
    // Only subscribe to channels from OTHER services.
    // alert:triggered is now handled internally via direct call.
    this.redisSub.subscribe('recommendation:new', 'order:executed', (err) => {
      if (err) {
        logger.error('Failed to subscribe to notification channels', err);
        return;
      }
      logger.info('Subscribed to recommendation:new, order:executed');
    });

    this.redisSub.on('message', async (channel, message) => {
      try {
        const payload = JSON.parse(message);
        switch (channel) {
          case 'recommendation:new':
            await this.handleNewRecommendation(payload);
            break;
          case 'order:executed':
            await this.handleOrderExecuted(payload);
            break;
        }
      } catch (err) {
        logger.error(`Error handling ${channel} message`, err);
      }
    });

    // Periodic cleanup of old notifications (> 90 days)
    setInterval(async () => {
      try {
        const deleted = await this.repo.deleteOlderThan(90);
        if (deleted > 0) logger.info(`Cleaned up ${deleted} old notifications`);
      } catch (err) {
        logger.error('Error cleaning up old notifications', err);
      }
    }, 24 * 60 * 60 * 1000);
  }

  async stop(): Promise<void> {
    await this.redisSub.unsubscribe();
    this.redisSub.disconnect();
  }
}
