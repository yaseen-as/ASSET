// ─── Alert Types ───

import { Exchange } from './broker.types';

export type AlertType = 'price' | 'volume' | 'indicator' | 'corporate_action';
export type AlertOperator = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'crosses_above' | 'crosses_below';

export interface AlertCondition {
  operator: AlertOperator;
  value: number;
  indicator?: string; // e.g. "rsi_14", "sma_50"
}

export interface Alert {
  id: string;
  userId: string;
  symbol: string;
  exchange: Exchange;
  alertType: AlertType;
  condition: AlertCondition;
  isTriggered: boolean;
  isActive: boolean;
  triggeredAt?: Date;
  createdAt: Date;
}

export interface CreateAlertDTO {
  symbol: string;
  exchange: Exchange;
  alertType: AlertType;
  condition: AlertCondition;
}

export interface UpdateAlertDTO {
  isActive?: boolean;
}
