import { db } from '../../config/database';
import type { BacktestParams, BacktestSummary, BacktestRecord, Trade, EquityPoint } from '../types';

interface Row {
  id: string;
  model_id: string;
  start_date: Date;
  end_date: Date;
  params: BacktestParams;
  sharpe_ratio: string | null;
  max_drawdown: string | null;
  win_rate: string | null;
  cagr: string | null;
  total_trades: number | null;
  equity_curve: EquityPoint[] | null;
  trades: Trade[] | null;
  created_at: Date;
}

export class BacktestRepository {
  async insertQueued(req: { model_id: string; start_date: string; end_date: string; params: BacktestParams }): Promise<string> {
    const [row] = await db('recommendations.backtest_results')
      .insert({
        model_id: req.model_id,
        start_date: req.start_date,
        end_date: req.end_date,
        params: req.params,
      })
      .returning('id');
    return row.id;
  }

  async saveResult(id: string, summary: BacktestSummary): Promise<void> {
    await db('recommendations.backtest_results')
      .where({ id })
      .update({
        sharpe_ratio: summary.sharpe_ratio,
        max_drawdown: summary.max_drawdown,
        win_rate: summary.win_rate,
        cagr: summary.cagr,
        total_trades: summary.total_trades,
        equity_curve: JSON.stringify(summary.equity_curve),
        trades: JSON.stringify(summary.trades),
      });
  }

  async getById(id: string): Promise<BacktestRecord | null> {
    const r = (await db('recommendations.backtest_results').where({ id }).first()) as Row | undefined;
    if (!r) return null;
    return this.toRecord(r);
  }

  async listByModel(modelId: string, limit = 20): Promise<BacktestRecord[]> {
    const rows = (await db('recommendations.backtest_results')
      .where({ model_id: modelId })
      .orderBy('created_at', 'desc')
      .limit(limit)) as Row[];
    return rows.map((r) => this.toRecord(r));
  }

  private toRecord(r: Row): BacktestRecord {
    const status: BacktestRecord['status'] =
      r.sharpe_ratio === null && r.total_trades === null ? 'running' : 'completed';
    return {
      id: r.id,
      model_id: r.model_id,
      start_date: r.start_date.toISOString().slice(0, 10),
      end_date: r.end_date.toISOString().slice(0, 10),
      params: r.params,
      status,
      sharpe_ratio: r.sharpe_ratio ? Number(r.sharpe_ratio) : 0,
      max_drawdown: r.max_drawdown ? Number(r.max_drawdown) : 0,
      win_rate: r.win_rate ? Number(r.win_rate) : 0,
      cagr: r.cagr ? Number(r.cagr) : 0,
      total_trades: r.total_trades ?? 0,
      equity_curve: r.equity_curve ?? [],
      trades: r.trades ?? [],
      created_at: r.created_at.toISOString(),
    };
  }
}
