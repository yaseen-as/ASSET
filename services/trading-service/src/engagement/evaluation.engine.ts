import { AlertRepository, AlertRow } from './alert.repository';
import { NotificationService } from './notification.service';
import { config } from '../config';
import { createLogger } from '../utils/logger';

const logger = createLogger('EvaluationEngine');

/**
 * Evaluates alerts on-demand for a given symbol+price tick.
 * Called by insights-service HTTP polling results forwarded from alert checks,
 * or triggered periodically via setInterval for stale-alert expiry.
 */
export class EvaluationEngine {
  private alertRepo: AlertRepository;
  private notificationService: NotificationService;
  private expiryTimer: NodeJS.Timeout | null = null;

  constructor(alertRepo: AlertRepository, notificationService: NotificationService) {
    this.alertRepo = alertRepo;
    this.notificationService = notificationService;
  }

  start(): void {
    // Periodic expiry check — no Redis subscription needed
    this.expiryTimer = setInterval(async () => {
      try {
        const expired = await this.alertRepo.expireStale();
        if (expired > 0) logger.info(`Expired ${expired} stale alerts`);
      } catch (err) {
        logger.error('Error expiring stale alerts', err);
      }
    }, 60_000);
  }

  async evaluateForSymbol(
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

      if (alert.last_triggered_at) {
        const elapsed = Date.now() - new Date(alert.last_triggered_at).getTime();
        if (elapsed < config.engagement.alertCooldownMs) continue;
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

      await this.notificationService.handleAlertTriggered(triggerPayload);

      if (
        config.engagement.alertMaxTriggerCount > 0 &&
        updated.trigger_count >= config.engagement.alertMaxTriggerCount
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
    if (this.expiryTimer) clearInterval(this.expiryTimer);
  }
}
