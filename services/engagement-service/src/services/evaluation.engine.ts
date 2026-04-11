import Redis from 'ioredis';
import { AlertRepository, AlertRow } from '../alerts/alert.repository';
import { NotificationService } from '../notifications/notification.service';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('EvaluationEngine');

/**
 * Subscribes to market:tick:* via Redis and evaluates active alerts.
 * When an alert triggers, it directly calls NotificationService
 * (no Redis hop — both domains live in the same process).
 *
 * Still publishes alert:triggered to Redis for any external consumers.
 */
export class EvaluationEngine {
  private alertRepo: AlertRepository;
  private notificationService: NotificationService;
  private redisSub: Redis;
  private redisPub: Redis;

  constructor(alertRepo: AlertRepository, notificationService: NotificationService) {
    this.alertRepo = alertRepo;
    this.notificationService = notificationService;
    this.redisSub = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
    });
    this.redisPub = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
    });
  }

  start(): void {
    this.redisSub.psubscribe('market:tick:*', (err) => {
      if (err) {
        logger.error('Failed to subscribe to market ticks', err);
        return;
      }
      logger.info('Subscribed to market:tick:* channels');
    });

    this.redisSub.on('pmessage', async (_pattern, channel, message) => {
      try {
        const parts = channel.split(':');
        const exchange = parts[2];
        const symbol = parts[3];
        if (!exchange || !symbol) return;

        const tick = JSON.parse(message);
        await this.evaluateForSymbol(symbol, exchange, tick);
      } catch (err) {
        logger.error('Error processing tick message', err);
      }
    });

    // Periodic expiry check
    setInterval(async () => {
      try {
        const expired = await this.alertRepo.expireStale();
        if (expired > 0) logger.info(`Expired ${expired} stale alerts`);
      } catch (err) {
        logger.error('Error expiring stale alerts', err);
      }
    }, 60_000);
  }

  private async evaluateForSymbol(
    symbol: string,
    exchange: string,
    tick: { ltp: number; volume?: number; change_pct?: number },
  ): Promise<void> {
    const alerts = await this.alertRepo.findActiveBySymbol(symbol, exchange);
    if (alerts.length === 0) return;

    for (const alert of alerts) {
      const triggered = this.checkCondition(alert, tick);
      if (!triggered) {
        await this.alertRepo.update(alert.id, { last_evaluated_value: tick.ltp });
        continue;
      }

      // Cooldown check
      if (alert.last_triggered_at) {
        const elapsed = Date.now() - new Date(alert.last_triggered_at).getTime();
        if (elapsed < config.alertEvaluation.cooldownMs) continue;
      }

      const updated = await this.alertRepo.markTriggered(alert.id, tick.ltp);
      if (!updated) continue;

      logger.info(`Alert triggered: ${alert.id} — ${alert.condition_type} ${alert.threshold} on ${symbol}`);

      const triggerPayload = {
        alertId: alert.id,
        userId: alert.user_id,
        symbol,
        exchange,
        conditionType: alert.condition_type,
        threshold: alert.threshold,
        currentValue: tick.ltp,
        triggeredAt: new Date().toISOString(),
        label: alert.label || undefined,
      };

      // Direct call — no Redis hop needed within same process
      await this.notificationService.handleAlertTriggered(triggerPayload);

      // Still publish for any external consumers
      await this.redisPub.publish('alert:triggered', JSON.stringify(triggerPayload));

      // Auto-disable if max trigger count reached
      if (
        config.alertEvaluation.maxTriggerCount > 0 &&
        updated.trigger_count >= config.alertEvaluation.maxTriggerCount
      ) {
        await this.alertRepo.update(alert.id, { status: 'disabled' });
        logger.info(`Alert ${alert.id} auto-disabled after ${updated.trigger_count} triggers`);
      }
    }
  }

  private checkCondition(
    alert: AlertRow,
    tick: { ltp: number; volume?: number; change_pct?: number },
  ): boolean {
    const { condition_type, threshold, last_evaluated_value } = alert;
    const price = tick.ltp;

    switch (condition_type) {
      case 'price_above':
        return price >= threshold;
      case 'price_below':
        return price <= threshold;
      case 'price_crosses_above':
        if (last_evaluated_value === null) return price >= threshold;
        return last_evaluated_value < threshold && price >= threshold;
      case 'price_crosses_below':
        if (last_evaluated_value === null) return price <= threshold;
        return last_evaluated_value > threshold && price <= threshold;
      case 'percent_change_above':
        return (tick.change_pct ?? 0) >= threshold;
      case 'percent_change_below':
        return (tick.change_pct ?? 0) <= -threshold;
      case 'volume_above':
        return (tick.volume ?? 0) >= threshold;
      default:
        return false;
    }
  }

  async stop(): Promise<void> {
    await this.redisSub.punsubscribe('market:tick:*');
    this.redisSub.disconnect();
    this.redisPub.disconnect();
  }
}
