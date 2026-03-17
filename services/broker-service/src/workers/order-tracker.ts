import Redis from 'ioredis';
import { OrderRepository } from '../repositories/order.repository';
import { BrokerConnectionRepository } from '../repositories/broker.repository';
import { AngelOneClient } from '../services/angelone.client';
import { decrypt } from '../utils/encryption';
import { config } from '../config';

export class OrderTracker {
  private interval: NodeJS.Timeout | null = null;
  private orderRepo = new OrderRepository();
  private brokerRepo = new BrokerConnectionRepository();
  private angelOne = new AngelOneClient();
  private redisPub: Redis;

  constructor() {
    this.redisPub = new Redis(config.redis.url);
  }

  start(): void {
    // Poll every 30 seconds
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
          const orderBook = await this.angelOne.getOrderBook(accessToken);

          for (const order of orders) {
            const brokerOrder = orderBook.find((o: any) => o.orderid === order.broker_order_id);
            if (!brokerOrder) continue;

            const newStatus = this.mapStatus(brokerOrder.orderstatus || brokerOrder.status || '');
            if (newStatus === order.status) continue;

            await this.orderRepo.updateStatus(order.id, {
              status: newStatus,
              filled_quantity: parseInt(brokerOrder.filledshares || brokerOrder.fillquantity || '0', 10),
              avg_fill_price: parseFloat(brokerOrder.averageprice || '0') || undefined,
              filled_at: newStatus === 'EXECUTED' ? new Date() : undefined,
              rejection_reason: brokerOrder.text || brokerOrder.rejectionreason || undefined,
            });

            // Publish status change events
            if (newStatus === 'EXECUTED') {
              await this.redisPub.publish('order:executed', JSON.stringify({
                userId: order.user_id,
                orderId: order.id,
                symbol: order.symbol,
                exchange: order.exchange,
                action: order.action,
                quantity: parseInt(brokerOrder.filledshares || String(order.quantity), 10),
                price: parseFloat(brokerOrder.averageprice || '0'),
              }));
            } else if (newStatus === 'REJECTED') {
              await this.redisPub.publish('order:rejected', JSON.stringify({
                userId: order.user_id,
                orderId: order.id,
                symbol: order.symbol,
                reason: brokerOrder.text || 'Rejected by exchange',
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

  private mapStatus(angelStatus: string): string {
    const map: Record<string, string> = {
      'open': 'OPEN',
      'pending': 'OPEN',
      'trigger pending': 'OPEN',
      'open pending': 'OPEN',
      'complete': 'EXECUTED',
      'traded': 'EXECUTED',
      'cancelled': 'CANCELLED',
      'rejected': 'REJECTED',
      'after market order req received': 'AMO_SUBMITTED',
      'modify pending': 'OPEN',
      'not cancelled': 'OPEN',
      'not modified': 'OPEN',
    };
    return map[angelStatus.toLowerCase()] || 'OPEN';
  }

  async stop(): Promise<void> {
    if (this.interval) clearInterval(this.interval);
    await this.redisPub.quit();
  }
}
