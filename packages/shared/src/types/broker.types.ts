// ─── Broker Types ───

export type BrokerName = 'angel_one';

export interface BrokerConnection {
  id: string;
  userId: string;
  brokerName: BrokerName;
  clientId: string;
  isActive: boolean;
  connectedAt: Date;
  updatedAt: Date;
}

export interface ConnectBrokerDTO {
  brokerName: BrokerName;
  clientId: string;
  password: string;
  totp: string;
}

export interface ToggleBrokerDTO {
  isActive: boolean;
}

export type OrderAction = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
export type OrderProductType = 'DELIVERY' | 'INTRADAY';

export interface PlaceOrderDTO {
  connectionId: string;
  symbol: string;
  exchange: Exchange;
  action: OrderAction;
  quantity: number;
  orderType: OrderType;
  price?: number;
  triggerPrice?: number;
  productType?: OrderProductType;
}

export interface OrderResponse {
  orderId: string;
  status: string;
  message: string;
}

export type Exchange = 'NSE' | 'BSE';
