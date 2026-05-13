export interface BacktestParams {
  top_n: number;                    // how many top-scored symbols to enter each day
  position_size_fraction: number;   // fraction of equity per position (e.g. 0.05 = 5%)
  stop_loss: number;                // e.g. -0.05 (-5%)
  take_profit: number;              // e.g. 0.10 (+10%)
  max_holding_days: number;         // forced exit after N trading days
  initial_capital: number;
  cost_bps: number;                 // round-trip cost in basis points (entry + exit)
  exchange: string;
}

export interface BacktestRequest {
  model_id: string;
  start_date: string;               // YYYY-MM-DD
  end_date: string;
  params: BacktestParams;
}

export interface Trade {
  symbol: string;
  exchange: string;
  entry_date: string;
  entry_price: number;
  exit_date: string;
  exit_price: number;
  holding_days: number;
  pnl: number;                      // net of costs, in currency
  return_pct: number;               // net of costs
  exit_reason: 'stop_loss' | 'take_profit' | 'max_holding' | 'end_of_backtest';
}

export interface EquityPoint {
  date: string;
  equity: number;
}

export interface BacktestSummary {
  sharpe_ratio: number;
  max_drawdown: number;
  win_rate: number;
  cagr: number;
  total_trades: number;
  equity_curve: EquityPoint[];
  trades: Trade[];
}

export interface BacktestRecord extends BacktestSummary {
  id: string;
  model_id: string;
  start_date: string;
  end_date: string;
  params: BacktestParams;
  status: 'queued' | 'running' | 'completed' | 'failed';
  error?: string;
  created_at: string;
}
