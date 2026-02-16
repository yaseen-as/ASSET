// ─── Recommendation Types ───

import { Exchange } from './broker.types';

export type SignalType = 'BUY' | 'SELL' | 'HOLD';
export type SignalSource = 'rule_engine' | 'ml_model' | 'sentiment';

export interface Signal {
  id: string;
  symbol: string;
  exchange: Exchange;
  signalType: SignalType;
  source: SignalSource;
  confidence: number; // 0–100
  reasoning: string;
  metadata?: Record<string, unknown>;
  validUntil?: Date;
  createdAt: Date;
}

export interface UserRecommendation {
  id: string;
  userId: string;
  signalId: string;
  signal: Signal;
  personalizationScore: number; // 0–100
  isViewed: boolean;
  createdAt: Date;
}

export interface RecommendationQuery {
  source?: SignalSource | 'all';
  minConfidence?: number;
  symbol?: string;
  exchange?: Exchange;
  limit?: number;
}

// Signal provider interface — all engines implement this
export interface SignalProvider {
  name: string;
  evaluate(symbol: string, exchange: Exchange): Promise<Signal | null>;
}
