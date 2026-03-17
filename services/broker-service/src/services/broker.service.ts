import axios from 'axios';
import { BrokerConnectionRepository, type ConnectionRow } from '../repositories/broker.repository';
import { OrderRepository } from '../repositories/order.repository';
import { AngelOneClient } from './angelone.client';
import { SymbolMasterService } from './symbol-master.service';
import { PaperTradingService, type PaperBalance } from './paper-trading.service';
import { encrypt, decrypt } from '../utils/encryption';
import { config } from '../config';
import type { BrokerConnection, ConnectBrokerDTO, PlaceOrderDTO, OrderResponse } from '@platform/shared';

export class BrokerService {
  private repo = new BrokerConnectionRepository();
  private orderRepo = new OrderRepository();
  private angelOne = new AngelOneClient();
  private symbolMaster = new SymbolMasterService();
  private paperTrading = new PaperTradingService();

  async connect(userId: string, dto: ConnectBrokerDTO): Promise<BrokerConnection> {
    // Check existing connection
    const existing = await this.repo.findByUserIdAndBroker(userId, dto.brokerName);
    if (existing) {
      throw new ServiceError('Broker already connected. Disconnect first.', 'BROKER_ALREADY_CONNECTED', 409);
    }

    // Login to broker
    const tokens = await this.angelOne.login(dto.clientId, dto.password, dto.totp);

    // Store encrypted tokens (including feedToken for real-time market data)
    const row = await this.repo.create({
      user_id: userId,
      broker_name: dto.brokerName,
      client_id: encrypt(dto.clientId),
      access_token: encrypt(tokens.accessToken),
      refresh_token: encrypt(tokens.refreshToken),
      feed_token: tokens.feedToken ? encrypt(tokens.feedToken) : null,
      token_expiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
      is_active: true,
    });

    return this.mapToConnection(row);
  }

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

  async placeOrder(userId: string, dto: PlaceOrderDTO): Promise<OrderResponse> {
    // Check if user has paper trading enabled
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

    // Live order flow
    const conn = await this.repo.findById(dto.connectionId);
    if (!conn || conn.user_id !== userId) {
      throw new ServiceError('Connection not found', 'NOT_FOUND', 404);
    }
    if (!conn.is_active) {
      throw new ServiceError('Broker connection is disabled', 'BROKER_DISABLED', 400);
    }
    if (!conn.access_token) {
      throw new ServiceError('No valid broker session', 'NO_SESSION', 401);
    }

    // Resolve symbol token
    const symbolInfo = await this.symbolMaster.resolveToken(dto.symbol, dto.exchange);
    const tradingSymbol = symbolInfo?.tradingSymbol || dto.symbol;
    const symbolToken = symbolInfo?.token || '';

    const accessToken = decrypt(conn.access_token);

    const result = await this.angelOne.placeOrder(accessToken, {
      variety: 'NORMAL',
      tradingsymbol: tradingSymbol,
      symboltoken: symbolToken,
      transactiontype: dto.action,
      exchange: dto.exchange,
      ordertype: dto.orderType,
      producttype: dto.productType || 'DELIVERY',
      duration: 'DAY',
      price: dto.price?.toString() || '0',
      quantity: dto.quantity.toString(),
    });

    // Persist order to history
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

    return {
      orderId: order.id,
      status: 'PLACED',
      message: 'Order placed successfully.',
    };
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

    if (!order.connection_id || !order.broker_order_id) {
      throw new ServiceError('Cannot cancel — missing broker reference', 'NO_BROKER_REF', 400);
    }

    const conn = await this.repo.findById(order.connection_id);
    if (!conn?.access_token) {
      throw new ServiceError('No valid broker session', 'NO_SESSION', 401);
    }

    const accessToken = decrypt(conn.access_token);
    await this.angelOne.cancelOrder(accessToken, 'NORMAL', order.broker_order_id);
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

  async getFeedTokens(userId: string): Promise<{ connectionId: string; feedToken: string }[]> {
    const rows = await this.repo.findByUserId(userId);
    const result: { connectionId: string; feedToken: string }[] = [];
    for (const row of rows) {
      if (row.is_active && row.feed_token) {
        result.push({ connectionId: row.id, feedToken: decrypt(row.feed_token) });
      }
    }
    return result;
  }

  async getActiveFeedTokens(): Promise<{ userId: string; feedToken: string; clientId: string }[]> {
    const rows = await this.repo.findActiveConnections();
    const result: { userId: string; feedToken: string; clientId: string }[] = [];
    for (const row of rows) {
      if (row.feed_token) {
        result.push({
          userId: row.user_id,
          feedToken: decrypt(row.feed_token),
          clientId: decrypt(row.client_id),
        });
      }
    }
    return result;
  }

  async getHoldings(userId: string, connectionId: string): Promise<unknown[]> {
    const conn = await this.repo.findById(connectionId);
    if (!conn || conn.user_id !== userId || !conn.access_token) {
      throw new ServiceError('Connection not found or no session', 'NOT_FOUND', 404);
    }
    const accessToken = decrypt(conn.access_token);
    return this.angelOne.getHoldings(accessToken);
  }

  // Symbol master delegations
  async searchSymbols(query: string, exchange?: string, limit?: number) {
    return this.symbolMaster.searchSymbols(query, exchange, limit);
  }

  async getSymbolInfo(symbol: string, exchange: string) {
    return this.symbolMaster.resolveToken(symbol, exchange);
  }

  async syncSymbolMaster() {
    return this.symbolMaster.fetchAndSync();
  }

  // Paper trading delegations
  async getPaperBalance(userId: string): Promise<PaperBalance> {
    return this.paperTrading.getBalance(userId);
  }

  async resetPaperAccount(userId: string) {
    return this.paperTrading.resetAccount(userId);
  }

  private async isPaperTradingEnabled(userId: string): Promise<boolean> {
    try {
      const { data } = await axios.get(
        `${config.userServiceUrl}/api/v1/users/profile`,
        { headers: { 'x-user-id': userId }, timeout: 3000 }
      );
      return data.data?.paperTrading ?? data.data?.paper_trading ?? false;
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

export class ServiceError extends Error {
  constructor(message: string, public code: string, public statusCode: number) {
    super(message);
    this.name = 'ServiceError';
  }
}
