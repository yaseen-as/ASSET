import { BrokerConnectionRepository, type ConnectionRow } from './broker.repository';
import { OrderRepository } from './order.repository';
import * as upstox from './upstox.client';
import { UpstoxInstrumentService, type SymbolInfo } from './upstox-instrument.service';
import { PaperTradingService, type PaperBalance } from './paper-trading.service';
import { ProfileService } from '../users/profile.service';
import { encrypt, decrypt } from '../utils/encryption';
import { logger } from '../utils/logger';
import type { BrokerConnection, PlaceOrderDTO, OrderResponse } from '@platform/shared';

export class ServiceError extends Error {
  constructor(message: string, public code: string, public statusCode: number) {
    super(message);
    this.name = 'ServiceError';
  }
}

export class BrokerService {
  private repo = new BrokerConnectionRepository();
  private orderRepo = new OrderRepository();
  private instruments = new UpstoxInstrumentService();
  private paperTrading = new PaperTradingService();
  private profileService = new ProfileService();

  // ─── Token helper ──────────────────────────────────────────────────────────
  // Every Upstox API call reads the user's access_token from the DB at call time.

  private async getAccessToken(userId: string): Promise<string> {
    const conn = await this.repo.findActiveByUserId(userId);
    if (!conn || !conn.access_token) {
      throw new ServiceError('Upstox account not connected', 'BROKER_NOT_CONNECTED', 401);
    }
    if (conn.expires_at && new Date(conn.expires_at) < new Date()) {
      throw new ServiceError('Upstox session expired — please reconnect', 'TOKEN_EXPIRED', 401);
    }
    return decrypt(conn.access_token);
  }

  private async getAnyAccessToken(): Promise<string> {
    const conns = await this.repo.findActiveConnections();
    const conn = conns.find(c => c.access_token && (!c.expires_at || new Date(c.expires_at) > new Date()));
    if (!conn || !conn.access_token) {
      throw new ServiceError('No active broker connection available', 'NO_SESSION', 401);
    }
    return decrypt(conn.access_token);
  }

  // ─── Connection management ─────────────────────────────────────────────────

  async disconnect(userId: string, connectionId: string): Promise<void> {
    const conn = await this.repo.findById(connectionId);
    if (!conn || conn.user_id !== userId) {
      throw new ServiceError('Connection not found', 'NOT_FOUND', 404);
    }
    await this.repo.delete(connectionId);
  }

  async getConnections(userId: string): Promise<BrokerConnection[]> {
    const rows = await this.repo.findByUserId(userId);
    return rows.map((r) => this.mapToConnection(r));
  }

  async toggleConnection(userId: string, connectionId: string, isActive: boolean): Promise<BrokerConnection> {
    const conn = await this.repo.findById(connectionId);
    if (!conn || conn.user_id !== userId) {
      throw new ServiceError('Connection not found', 'NOT_FOUND', 404);
    }
    const updated = await this.repo.update(connectionId, { is_active: isActive });
    return this.mapToConnection(updated);
  }

  // ─── Holdings ──────────────────────────────────────────────────────────────

  async getHoldings(userId: string, connectionId: string): Promise<unknown[]> {
    const conn = await this.repo.findById(connectionId);
    if (!conn || conn.user_id !== userId || !conn.access_token) {
      throw new ServiceError('Connection not found or no session', 'NOT_FOUND', 404);
    }
    const token = decrypt(conn.access_token);
    return upstox.getHoldings(token);
  }

  // ─── Orders ────────────────────────────────────────────────────────────────

  async placeOrder(userId: string, dto: PlaceOrderDTO): Promise<OrderResponse> {
    const isPaper = await this.isPaperTradingEnabled(userId);

    if (isPaper) {
      return this.paperTrading.placePaperOrder(userId, {
        symbol: dto.symbol,
        exchange: dto.exchange,
        action: dto.action,
        orderType: dto.orderType,
        productType: dto.productType || 'DELIVERY',
        quantity: dto.quantity,
        price: dto.price,
      });
    }

    const token = await this.getAccessToken(userId);

    // Resolve symbol → Upstox instrument_key
    const symbolInfo = await this.instruments.resolveInstrument(dto.symbol, dto.exchange);
    if (!symbolInfo) {
      throw new ServiceError(`Symbol ${dto.exchange}:${dto.symbol} not found`, 'SYMBOL_NOT_FOUND', 404);
    }

    const result = await upstox.placeOrder(token, {
      instrument_token: symbolInfo.instrumentKey,
      quantity: dto.quantity,
      product: dto.productType === 'INTRADAY' ? 'I' : 'D',
      validity: 'DAY',
      price: dto.price || 0,
      order_type: dto.orderType as any,
      transaction_type: dto.action as 'BUY' | 'SELL',
    });

    const order = await this.orderRepo.create({
      user_id: userId,
      connection_id: dto.connectionId,
      broker_order_id: result.orderId,
      symbol: dto.symbol,
      exchange: dto.exchange,
      action: dto.action,
      order_type: dto.orderType,
      product_type: dto.productType || 'DELIVERY',
      quantity: dto.quantity,
      price: dto.price || 0,
      status: 'PLACED',
      source: 'live',
    });

    return { orderId: order.id, status: 'PLACED', message: 'Order placed successfully.' };
  }

  async cancelOrder(userId: string, orderId: string): Promise<void> {
    const order = await this.orderRepo.findById(orderId);
    if (!order || order.user_id !== userId) {
      throw new ServiceError('Order not found', 'NOT_FOUND', 404);
    }
    if (!['PLACED', 'OPEN', 'AMO_SUBMITTED'].includes(order.status)) {
      throw new ServiceError('Order cannot be cancelled', 'INVALID_STATE', 400);
    }

    if (order.source === 'paper') {
      await this.orderRepo.updateStatus(orderId, { status: 'CANCELLED' });
      return;
    }

    if (!order.broker_order_id) {
      throw new ServiceError('Cannot cancel — missing broker reference', 'NO_BROKER_REF', 400);
    }

    const token = await this.getAccessToken(userId);
    await upstox.cancelOrder(token, order.broker_order_id);
    await this.orderRepo.updateStatus(orderId, { status: 'CANCELLED' });
  }

  async getOrders(userId: string, filters: { status?: string; source?: string }, limit = 20, offset = 0) {
    const orders = await this.orderRepo.findByUserIdFiltered(userId, filters, limit, offset);
    const total = await this.orderRepo.countByUserId(userId, filters);
    return { orders, total };
  }

  async getOrder(userId: string, orderId: string) {
    const order = await this.orderRepo.findById(orderId);
    if (!order || order.user_id !== userId) {
      throw new ServiceError('Order not found', 'NOT_FOUND', 404);
    }
    return order;
  }

  async getOrderStats(userId: string) {
    return this.orderRepo.getStats(userId);
  }

  // ─── Market quotes (uses any active connection's token) ────────────────────

  async getQuote(exchange: string, symbol: string): Promise<{
    ltp: number; open: number; high: number; low: number; close: number; volume: number;
  }> {
    const symbolInfo = await this.resolveWithAutoSync(symbol, exchange);
    const token = await this.getAnyAccessToken();
    return upstox.getQuote(token, symbolInfo.instrumentKey);
  }

  // ─── Symbols ───────────────────────────────────────────────────────────────

  async searchSymbols(query: string, exchange?: string, limit?: number) {
    return this.instruments.searchSymbols(query, exchange, limit);
  }

  async getSymbolInfo(symbol: string, exchange: string) {
    return this.instruments.resolveInstrument(symbol, exchange);
  }

  async syncSymbolMaster() {
    return this.instruments.fetchAndSync();
  }

  // ─── Paper trading ─────────────────────────────────────────────────────────

  async getPaperBalance(userId: string): Promise<PaperBalance> {
    return this.paperTrading.getBalance(userId);
  }

  async getPaperPositions(userId: string) {
    return this.paperTrading.getPositions(userId);
  }

  async resetPaperAccount(userId: string) {
    return this.paperTrading.resetAccount(userId);
  }

  // ─── Raw access for portfolio domain ───────────────────────────────────────

  async getConnectionsRaw(userId: string): Promise<ConnectionRow[]> {
    return this.repo.findByUserId(userId);
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async resolveWithAutoSync(symbol: string, exchange: string): Promise<SymbolInfo> {
    let info = await this.instruments.resolveInstrument(symbol, exchange);
    if (!info) {
      const isStale = await this.instruments.isStale();
      if (isStale) {
        logger.info(`Symbol ${exchange}:${symbol} not found, triggering instrument sync...`);
        await this.instruments.fetchAndSync();
        info = await this.instruments.resolveInstrument(symbol, exchange);
      }
      if (!info) {
        throw new ServiceError(`Symbol ${exchange}:${symbol} not found. Try syncing instruments.`, 'SYMBOL_NOT_FOUND', 404);
      }
    }
    return info;
  }

  private async isPaperTradingEnabled(userId: string): Promise<boolean> {
    try {
      const profile = await this.profileService.getProfile(userId);
      return profile?.paperTrading ?? false;
    } catch {
      return false;
    }
  }

  private mapToConnection(row: ConnectionRow): BrokerConnection {
    return {
      id: row.id,
      userId: row.user_id,
      brokerName: row.broker_name as BrokerConnection['brokerName'],
      clientId: '****',
      isActive: row.is_active,
      connectedAt: row.connected_at,
      updatedAt: row.updated_at,
    };
  }
}
