import axios from 'axios';
import Redis from 'ioredis';
import { db } from '../config/database';
import { OrderRepository } from '../repositories/order.repository';
import { SymbolMasterService } from './symbol-master.service';
import { config } from '../config';
import type { OrderResponse } from '@platform/shared';

export interface PaperBalance {
  cash: number;
  invested: number;
  totalValue: number;
}

interface PlacePaperOrderDTO {
  symbol: string;
  exchange: string;
  action: string;
  orderType: string;
  productType: string;
  quantity: number;
  price?: number;
}

const DEFAULT_CASH = 1_000_000; // ₹10,00,000

export class PaperTradingService {
  private orderRepo = new OrderRepository();
  private symbolMaster = new SymbolMasterService();
  private redis: Redis;
  private redisPub: Redis;

  constructor() {
    this.redis = new Redis(config.redis.url);
    this.redisPub = new Redis(config.redis.url);
  }

  async placePaperOrder(userId: string, dto: PlacePaperOrderDTO): Promise<OrderResponse> {
    // Resolve symbol for validation
    const symbolInfo = await this.symbolMaster.resolveToken(dto.symbol, dto.exchange);
    if (!symbolInfo) {
      throw new Error(`Symbol not found: ${dto.exchange}:${dto.symbol}`);
    }

    // Get current price from Redis tick cache
    const ltp = await this.getCurrentPrice(dto.exchange, dto.symbol);
    const fillPrice = dto.orderType === 'MARKET'
      ? ltp
      : (dto.price || ltp);

    // Simulate slippage for market orders (±0.1%)
    const slippage = dto.orderType === 'MARKET'
      ? fillPrice * (dto.action === 'BUY' ? 0.001 : -0.001)
      : 0;
    const executionPrice = Math.round((fillPrice + slippage) * 100) / 100;

    const totalCost = executionPrice * dto.quantity;

    // Get or create paper account
    const account = await this.getOrCreateAccount(userId);

    // Validate cash for BUY orders
    if (dto.action === 'BUY' && account.cash < totalCost) {
      throw new Error(`Insufficient paper balance. Need ₹${totalCost.toFixed(2)}, have ₹${account.cash.toFixed(2)}`);
    }

    // Create order as immediately EXECUTED
    const order = await this.orderRepo.create({
      user_id: userId,
      broker_order_id: `PAPER-${Date.now()}`,
      symbol: dto.symbol,
      exchange: dto.exchange,
      action: dto.action,
      order_type: dto.orderType,
      product_type: dto.productType,
      quantity: dto.quantity,
      price: dto.price,
      status: 'EXECUTED',
      source: 'paper',
    });

    // Update order with fill details
    await this.orderRepo.updateStatus(order.id, {
      status: 'EXECUTED',
      filled_quantity: dto.quantity,
      avg_fill_price: executionPrice,
      filled_at: new Date(),
    });

    // Update paper balance
    if (dto.action === 'BUY') {
      await this.updateCash(userId, -totalCost);
    } else {
      await this.updateCash(userId, totalCost);
    }

    // Publish execution event
    await this.redisPub.publish('order:executed', JSON.stringify({
      userId,
      orderId: order.id,
      symbol: dto.symbol,
      exchange: dto.exchange,
      action: dto.action,
      quantity: dto.quantity,
      price: executionPrice,
      source: 'paper',
    }));

    return {
      orderId: order.id,
      status: 'EXECUTED',
      message: `Paper ${dto.action} executed at ₹${executionPrice.toFixed(2)}`,
    };
  }

  async getBalance(userId: string): Promise<PaperBalance> {
    const account = await this.getOrCreateAccount(userId);
    const cash = Number(account.cash);

    // Calculate invested value from paper orders
    const orders = await this.orderRepo.findByUserIdFiltered(userId, { source: 'paper', status: 'EXECUTED' }, 1000, 0);
    let invested = 0;
    const positions = new Map<string, { qty: number; value: number }>();

    for (const o of orders) {
      const key = `${o.exchange}:${o.symbol}`;
      const pos = positions.get(key) || { qty: 0, value: 0 };
      if (o.action === 'BUY') {
        pos.qty += o.filled_quantity;
        pos.value += o.filled_quantity * (o.avg_fill_price || 0);
      } else {
        pos.qty -= o.filled_quantity;
        pos.value -= o.filled_quantity * (o.avg_fill_price || 0);
      }
      positions.set(key, pos);
    }

    // Calculate current value of open positions
    let totalValue = cash;
    for (const [key, pos] of positions) {
      if (pos.qty <= 0) continue;
      invested += pos.value;
      const [exchange, symbol] = key.split(':');
      const ltp = await this.getCurrentPrice(exchange, symbol);
      totalValue += ltp * pos.qty;
    }

    return {
      cash: Math.round(cash * 100) / 100,
      invested: Math.round(invested * 100) / 100,
      totalValue: Math.round(totalValue * 100) / 100,
    };
  }

  async getPositions(userId: string): Promise<{
    symbol: string;
    exchange: string;
    quantity: number;
    avgBuyPrice: number;
    currentPrice: number;
    investedValue: number;
    currentValue: number;
    pnl: number;
    pnlPercent: number;
  }[]> {
    const orders = await this.orderRepo.findByUserIdFiltered(userId, { source: 'paper', status: 'EXECUTED' }, 1000, 0);

    // Aggregate positions
    const positions = new Map<string, { qty: number; totalCost: number; exchange: string; symbol: string }>();
    for (const o of orders) {
      const key = `${o.exchange}:${o.symbol}`;
      const pos = positions.get(key) || { qty: 0, totalCost: 0, exchange: o.exchange, symbol: o.symbol };
      const fillPrice = o.avg_fill_price || o.price || 0;
      if (o.action === 'BUY') {
        pos.totalCost += o.filled_quantity * fillPrice;
        pos.qty += o.filled_quantity;
      } else {
        pos.totalCost -= o.filled_quantity * fillPrice;
        pos.qty -= o.filled_quantity;
      }
      positions.set(key, pos);
    }

    // Filter open positions and fetch current prices
    const result = [];
    for (const [, pos] of positions) {
      if (pos.qty <= 0) continue;
      const avgBuyPrice = pos.totalCost / pos.qty;
      let currentPrice = avgBuyPrice;
      try {
        currentPrice = await this.getCurrentPrice(pos.exchange, pos.symbol);
      } catch { /* use avg as fallback */ }

      const investedValue = avgBuyPrice * pos.qty;
      const currentValue = currentPrice * pos.qty;
      const pnl = currentValue - investedValue;
      const pnlPercent = investedValue > 0 ? (pnl / investedValue) * 100 : 0;

      result.push({
        symbol: pos.symbol,
        exchange: pos.exchange,
        quantity: pos.qty,
        avgBuyPrice: Math.round(avgBuyPrice * 100) / 100,
        currentPrice: Math.round(currentPrice * 100) / 100,
        investedValue: Math.round(investedValue * 100) / 100,
        currentValue: Math.round(currentValue * 100) / 100,
        pnl: Math.round(pnl * 100) / 100,
        pnlPercent: Math.round(pnlPercent * 100) / 100,
      });
    }

    return result.sort((a, b) => Math.abs(b.currentValue) - Math.abs(a.currentValue));
  }

  async resetAccount(userId: string): Promise<void> {
    // Delete all paper orders
    await this.orderRepo.deleteByUserAndSource(userId, 'paper');
    // Reset cash
    await db('broker.paper_accounts')
      .where({ user_id: userId })
      .update({ cash: DEFAULT_CASH, updated_at: db.fn.now() });
  }

  private async getOrCreateAccount(userId: string): Promise<{ cash: number }> {
    let account = await db('broker.paper_accounts').where({ user_id: userId }).first();
    if (!account) {
      [account] = await db('broker.paper_accounts')
        .insert({ user_id: userId, cash: DEFAULT_CASH })
        .returning('*');
    }
    return { cash: Number(account.cash) };
  }

  private async updateCash(userId: string, delta: number): Promise<void> {
    await db('broker.paper_accounts')
      .where({ user_id: userId })
      .update({
        cash: db.raw('cash + ?', [delta]),
        updated_at: db.fn.now(),
      });
  }

  private async getCurrentPrice(exchange: string, symbol: string): Promise<number> {
    const cacheKey = `market:tick:cache:${exchange}:${symbol}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const tick = JSON.parse(cached);
      return tick.ltp;
    }
    // Fallback: try market-data-service REST
    try {
      const { data } = await axios.get(
        `${config.marketDataServiceUrl}/api/v1/market/quote/${exchange}/${symbol}`,
        { timeout: 3000 }
      );
      return data.data?.ltp || 0;
    } catch {
      throw new Error(`Cannot determine price for ${exchange}:${symbol}. Market data unavailable.`);
    }
  }
}
