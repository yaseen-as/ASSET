import Redis from 'ioredis';
import { OrderRepository } from '../broker/order.repository';
import { BrokerConnectionRepository } from '../broker/broker.repository';
import { getOrderBook } from '../broker/upstox.client';
import { decrypt } from '../utils/encryption';
import { config } from '../config';

export class OrderTracker {
  private interval: NodeJS.Timeout | null = null;
  private orderRepo = new OrderRepository();
  private brokerRepo = new BrokerConnectionRepository();
  private redisPub: Redis;

  constructor() {
    this.redisPub = new Redis(config.redis.url);
  }

  start(): void {
    this.interval = setInterval(() => this.pollPendingOrders(), 30_000);
    console.log('[OrderTracker] Started — polling pending orders every 30s');
  }

  private async pollPendingOrders(): Promise<void> {
    try {
      const pending = await this.orderRepo.findPendingOrders();
      if (pending.length === 0) return;

      // Group by connection_id to minimize API calls
      const byConnection = new Map<string, typeof pending>();
      for (const order of pending) {
        if (!order.connection_id) continue;
        const group = byConnection.get(order.connection_id) || [];
        group.push(order);
        byConnection.set(order.connection_id, group);
      }

      for (const [connId, orders] of byConnection) {
        const conn = await this.brokerRepo.findById(connId);
        if (!conn?.access_token) continue;

        try {
          const accessToken = decrypt(conn.access_token);
          const orderBook = await getOrderBook(accessToken);

          for (const order of orders) {
            const brokerOrder = orderBook.find((o: any) => o.order_id === order.broker_order_id);
            if (!brokerOrder) continue;

            const newStatus = this.mapStatus(brokerOrder.status || '');
            if (newStatus === order.status) continue;

            await this.orderRepo.updateStatus(order.id, {
              status: newStatus,
              filled_quantity: brokerOrder.filled_quantity || 0,
              avg_fill_price: brokerOrder.average_price || undefined,
              filled_at: newStatus === 'EXECUTED' ? new Date() : undefined,
              rejection_reason: brokerOrder.status_message || undefined,
            });

            if (newStatus === 'EXECUTED') {
              await this.redisPub.publish('order:executed', JSON.stringify({
                userId: order.user_id,
                orderId: order.id,
                symbol: order.symbol,
                exchange: order.exchange,
                action: order.action,
                quantity: brokerOrder.filled_quantity || order.quantity,
                price: brokerOrder.average_price || 0,
              }));
            } else if (newStatus === 'REJECTED') {
              await this.redisPub.publish('order:rejected', JSON.stringify({
                userId: order.user_id,
                orderId: order.id,
                symbol: order.symbol,
                reason: brokerOrder.status_message || 'Rejected by exchange',
              }));
            }
          }
        } catch (err: any) {
          console.error(`[OrderTracker] Failed to poll connection ${connId}:`, err.message);
        }
      }
    } catch (err: any) {
      console.error('[OrderTracker] Poll error:', err.message);
    }
  }

  private mapStatus(upstoxStatus: string): string {
    const map: Record<string, string> = {
      'open': 'OPEN',
      'complete': 'EXECUTED',
      'cancelled': 'CANCELLED',
      'rejected': 'REJECTED',
      'validation pending': 'OPEN',
      'put order req received': 'OPEN',
      'modify validation pending': 'OPEN',
      'modify pending': 'OPEN',
      'trigger pending': 'OPEN',
      'not modified': 'OPEN',
      'not cancelled': 'OPEN',
      'after market order req received': 'AMO_SUBMITTED',
    };
    return map[upstoxStatus.toLowerCase()] || 'OPEN';
  }

  async stop(): Promise<void> {
    if (this.interval) clearInterval(this.interval);
    await this.redisPub.quit();
  }
}
