import { Request, Response, NextFunction } from 'express';
import { brokerService } from './broker.controller';
import { OrderRepository } from './order.repository';
import { BrokerConnectionRepository } from './broker.repository';
import { getOrderBook } from './upstox.client';
import { decrypt } from '../utils/encryption';

const orderRepo = new OrderRepository();
const brokerRepo = new BrokerConnectionRepository();

async function refreshPendingOrders(userId: string): Promise<void> {
  const conn = await brokerRepo.findActiveByUserId(userId);
  if (!conn?.access_token) return;
  if (conn.expires_at && new Date(conn.expires_at) < new Date()) return;

  const pending = await orderRepo.findByUserIdFiltered(userId, { status: 'OPEN' }, 100, 0);
  const alsoPlaced = await orderRepo.findByUserIdFiltered(userId, { status: 'PLACED' }, 100, 0);
  const allPending = [...pending, ...alsoPlaced].filter((o) => o.source === 'live');
  if (allPending.length === 0) return;

  try {
    const accessToken = decrypt(conn.access_token);
    const orderBook = await getOrderBook(accessToken);

    for (const order of allPending) {
      const brokerOrder = orderBook.find((o: any) => o.order_id === order.broker_order_id);
      if (!brokerOrder) continue;

      const statusMap: Record<string, string> = {
        'open': 'OPEN',
        'complete': 'EXECUTED',
        'cancelled': 'CANCELLED',
        'rejected': 'REJECTED',
        'validation pending': 'OPEN',
        'put order req received': 'OPEN',
        'trigger pending': 'OPEN',
        'after market order req received': 'AMO_SUBMITTED',
      };
      const newStatus = statusMap[brokerOrder.status?.toLowerCase() || ''] || 'OPEN';
      if (newStatus === order.status) continue;

      await orderRepo.updateStatus(order.id, {
        status: newStatus,
        filled_quantity: brokerOrder.filled_quantity || 0,
        avg_fill_price: brokerOrder.average_price || undefined,
        filled_at: newStatus === 'EXECUTED' ? new Date() : undefined,
        rejection_reason: brokerOrder.status_message || undefined,
      });
    }
  } catch {
    // Non-fatal — return stale data rather than failing the request
  }
}

export class OrderController {
  static async placeOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const result = await brokerService.placeOrder(userId, req.body);
      res.status(201).json({ success: true, data: result });
    } catch (error) { next(error); }
  }

  static async getOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const limit = Math.min(parseInt(req.query.limit as string || '20', 10), 100);
      const page = parseInt(req.query.page as string || '1', 10);
      const offset = (page - 1) * limit;
      const status = req.query.status as string | undefined;
      const source = req.query.source as string | undefined;

      // Refresh pending live orders on-demand before returning
      await refreshPendingOrders(userId);

      const { orders, total } = await brokerService.getOrders(userId, { status, source }, limit, offset);
      res.json({
        success: true,
        data: orders,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) { next(error); }
  }

  static async getOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const order = await brokerService.getOrder(userId, req.params.orderId);
      res.json({ success: true, data: order });
    } catch (error) { next(error); }
  }

  static async getOrderStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      const stats = await brokerService.getOrderStats(userId);
      res.json({ success: true, data: stats });
    } catch (error) { next(error); }
  }

  static async cancelOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.headers['x-user-id'] as string;
      await brokerService.cancelOrder(userId, req.params.orderId);
      res.json({ success: true, message: 'Order cancelled' });
    } catch (error) { next(error); }
  }
}
