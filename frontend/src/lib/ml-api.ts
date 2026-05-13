import api from './api';

export type ModelName = 'technical' | 'fundamental' | 'sentiment' | 'meta';
export type ModelStatus = 'draft' | 'canary' | 'production' | 'retired';

export interface ModelMeta {
  id: string;
  name: ModelName;
  version: string;
  framework: string;
  artifact_uri: string;
  feature_set: string;
  training_data: Record<string, unknown>;
  metrics: Record<string, unknown>;
  status: ModelStatus;
  rollout_percent: number;
  created_at: string;
  promoted_at: string | null;
}

export interface RankedRow {
  id: string;
  symbol: string;
  exchange: string;
  as_of_date: string;
  meta_model_id: string;
  technical_score: number | null;
  fundamental_score: number | null;
  sentiment_score: number | null;
  final_score: number;
  rank: number | null;
  created_at: string;
}

export interface BacktestParams {
  top_n: number;
  position_size_fraction: number;
  stop_loss: number;
  take_profit: number;
  max_holding_days: number;
  initial_capital: number;
  cost_bps: number;
  exchange: string;
}

export interface Trade {
  symbol: string;
  exchange: string;
  entry_date: string;
  entry_price: number;
  exit_date: string;
  exit_price: number;
  holding_days: number;
  pnl: number;
  return_pct: number;
  exit_reason: 'stop_loss' | 'take_profit' | 'max_holding' | 'end_of_backtest';
}

export interface EquityPoint { date: string; equity: number; }

export interface BacktestRecord {
  id: string;
  model_id: string;
  start_date: string;
  end_date: string;
  params: BacktestParams;
  status: 'queued' | 'running' | 'completed' | 'failed';
  sharpe_ratio: number;
  max_drawdown: number;
  win_rate: number;
  cagr: number;
  total_trades: number;
  equity_curve: EquityPoint[];
  trades: Trade[];
  created_at: string;
}

// ─── Recommendations ─────────────────────────────────────────────────────────
export async function fetchTopRecommendations(date: string, limit = 20): Promise<RankedRow[]> {
  const { data } = await api.get('/recommendations/top', { params: { date, limit } });
  return data.data as RankedRow[];
}

export async function rankUniverse(exchange: string, date: string, topN = 50): Promise<RankedRow[]> {
  const { data } = await api.post('/recommendations/rank', { exchange, date, top_n: topN });
  return data.data;
}

// ─── Models ──────────────────────────────────────────────────────────────────
export async function listModels(name?: ModelName): Promise<ModelMeta[]> {
  const { data } = await api.get('/models', { params: name ? { name } : {} });
  return data.data;
}

export async function promoteModel(id: string, status: ModelStatus, rolloutPercent: number): Promise<ModelMeta> {
  const { data } = await api.post(`/models/${id}/promote`, { status, rollout_percent: rolloutPercent });
  return data.data;
}

// ─── Backtest ────────────────────────────────────────────────────────────────
export async function submitBacktest(req: {
  model_id: string;
  start_date: string;
  end_date: string;
  params: BacktestParams;
}): Promise<{ id: string; status: string }> {
  const { data } = await api.post('/backtest/runs', req);
  return data.data;
}

export async function fetchBacktestRun(id: string): Promise<BacktestRecord> {
  const { data } = await api.get(`/backtest/runs/${id}`);
  return data.data;
}

export async function listBacktestResults(modelId: string, limit = 20): Promise<BacktestRecord[]> {
  const { data } = await api.get('/backtest/results', { params: { model_id: modelId, limit } });
  return data.data;
}
