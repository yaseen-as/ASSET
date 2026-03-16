import { BrokerConnectionRepository, type ConnectionRow } from '../repositories/broker.repository';
import { AngelOneClient } from './angelone.client';
import { encrypt, decrypt } from '../utils/encryption';
import type { BrokerConnection, ConnectBrokerDTO, PlaceOrderDTO, OrderResponse } from '@platform/shared';

export class BrokerService {
  private repo = new BrokerConnectionRepository();
  private angelOne = new AngelOneClient();

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
      token_expiry: new Date(Date.now() + 24 * 60 * 60 * 1000), // Angel One tokens valid ~24h
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

    const accessToken = decrypt(conn.access_token);

    const result = await this.angelOne.placeOrder(accessToken, {
      variety: 'NORMAL',
      tradingsymbol: dto.symbol,
      symboltoken: '', // Would need symbol token lookup
      transactiontype: dto.action,
      exchange: dto.exchange,
      ordertype: dto.orderType,
      producttype: dto.productType || 'DELIVERY',
      duration: 'DAY',
      price: dto.price?.toString() || '0',
      quantity: dto.quantity.toString(),
    });

    return {
      orderId: result.orderId,
      status: 'PLACED',
      message: 'Order placed successfully.',
    };
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

  private mapToConnection(row: ConnectionRow): BrokerConnection {
    return {
      id: row.id,
      userId: row.user_id,
      brokerName: row.broker_name as BrokerConnection['brokerName'],
      clientId: '****', // Never expose encrypted client ID
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
