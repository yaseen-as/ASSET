import Redis from 'ioredis';
import { AlertRepository, AlertRow } from '../repositories/alert.repository';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('AlertService');

export class AlertService {
  private alertRepo: AlertRepository;
  private redisSub: Redis;
  private redisPub: Redis;

  constructor() {
    this.alertRepo = new AlertRepository();
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

  /* ─── CRUD ────────────────────────────────────────────── */

  async createAlert(userId: string, data: {
    symbol: string;
    exchange?: string;
    condition_type: string;
    threshold: number;
    label?: string;
    note?: string;
    expires_at?: string;
  }): Promise<AlertRow> {
    const alert = await this.alertRepo.create({
      user_id: userId,
      symbol: data.symbol.toUpperCase(),
      exchange: (data.exchange || 'NSE').toUpperCase(),
      condition_type: data.condition_type,
      threshold: data.threshold,
      label: data.label,
      note: data.note,
      expires_at: data.expires_at ? new Date(data.expires_at) : null,
    });

    logger.info(`Alert created: ${alert.id} for ${alert.symbol}`);
    return alert;
  }

  async getUserAlerts(userId: string, status?: string): Promise<AlertRow[]> {
    return this.alertRepo.findByUser(userId, status);
  }

  async getAlertById(id: string, userId: string): Promise<AlertRow | null> {
    const alert = await this.alertRepo.findById(id);
    if (!alert || alert.user_id !== userId) return null;
    return alert;
  }

  async updateAlert(id: string, userId: string, data: Partial<Pick<AlertRow, 'label' | 'note' | 'threshold' | 'condition_type' | 'status' | 'expires_at'>>): Promise<AlertRow | null> {
    const alert = await this.alertRepo.findById(id);
    if (!alert || alert.user_id !== userId) return null;
    const updated = await this.alertRepo.update(id, data);
    return updated || null;
  }

  async deleteAlert(id: string, userId: string): Promise<boolean> {
    return this.alertRepo.delete(id, userId);
  }

  async reactivateAlert(id: string, userId: string): Promise<AlertRow | null> {
    const alert = await this.alertRepo.findById(id);
    if (!alert || alert.user_id !== userId) return null;
    if (alert.status !== 'triggered' && alert.status !== 'disabled') return null;
    const updated = await this.alertRepo.update(id, { status: 'active' });
    return updated || null;
  }

  /* ─── Evaluation Engine ───────────────────────────────── */

  /**
   * Start listening to market tick events via Redis Pub/Sub
   * and evaluate active alerts in real time.
   */
  startEvaluation(): void {
    // Subscribe to all market tick channels
    this.redisSub.psubscribe('market:tick:*', (err) => {
      if (err) {
        logger.error('Failed to subscribe to market ticks', err);
        return;
      }
      logger.info('Subscribed to market:tick:* channels');
    });

    this.redisSub.on('pmessage', async (_pattern, channel, message) => {
      try {
        // channel format: market:tick:NSE:RELIANCE
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
        // Update last evaluated value for cross-type conditions
        await this.alertRepo.update(alert.id, { last_evaluated_value: tick.ltp });
        continue;
      }

      // Cooldown check
      if (alert.last_triggered_at) {
        const elapsed = Date.now() - new Date(alert.last_triggered_at).getTime();
        if (elapsed < config.alertEvaluation.cooldownMs) continue;
      }

      // Trigger
      const updated = await this.alertRepo.markTriggered(alert.id, tick.ltp);
      if (!updated) continue;

      logger.info(`Alert triggered: ${alert.id} — ${alert.condition_type} ${alert.threshold} on ${symbol}`);

      // Publish trigger event so Notification Service can pick it up
      await this.redisPub.publish('alert:triggered', JSON.stringify({
        alertId: alert.id,
        userId: alert.user_id,
        symbol,
        exchange,
        conditionType: alert.condition_type,
        threshold: alert.threshold,
        currentValue: tick.ltp,
        triggeredAt: new Date().toISOString(),
        label: alert.label,
      }));

      // Auto-disable if max trigger count reached
      if (
        config.alertEvaluation.maxTriggerCount > 0 &&
        (updated.trigger_count >= config.alertEvaluation.maxTriggerCount)
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
        // Previous value was below threshold, now above
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

  /** Graceful shutdown */
  async stop(): Promise<void> {
    await this.redisSub.punsubscribe('market:tick:*');
    this.redisSub.disconnect();
    this.redisPub.disconnect();
  }
}
