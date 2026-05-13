import { db } from '../config/database';
import { toIsoDate } from '../utils/trading-days';

interface Score {
  symbol: string;
  score: number;
}

interface ModelMeta {
  id: string;
  name: 'technical' | 'fundamental' | 'sentiment' | 'meta' | string;
}

// Reads precomputed scores from the appropriate score table based on the
// model's name. For `meta`, reads final_scores.final_score; otherwise reads
// the per-model score table.
export class ScoreRepository {
  private byDate: Map<string, Score[]> = new Map();

  async loadAll(model: ModelMeta, exchange: string, start: string, end: string): Promise<void> {
    const { table, scoreCol } = this.tableFor(model.name);
    const idCol = model.name === 'meta' ? 'meta_model_id' : 'model_id';

    const rows = await db(table)
      .select('symbol', 'as_of_date', `${scoreCol} as score`)
      .where(idCol, model.id)
      .where('exchange', exchange)
      .whereBetween('as_of_date', [start, end]);

    for (const r of rows as any[]) {
      const date = toIsoDate(r.as_of_date);
      const arr = this.byDate.get(date) ?? [];
      arr.push({ symbol: r.symbol, score: Number(r.score) });
      this.byDate.set(date, arr);
    }
  }

  topN(date: string, n: number): Score[] {
    const all = this.byDate.get(date) ?? [];
    return [...all].sort((a, b) => b.score - a.score).slice(0, n);
  }

  private tableFor(name: string): { table: string; scoreCol: string } {
    if (name === 'meta') return { table: 'recommendations.final_scores', scoreCol: 'final_score' };
    if (name === 'technical') return { table: 'recommendations.technical_scores', scoreCol: 'score' };
    if (name === 'fundamental') return { table: 'recommendations.fundamental_scores', scoreCol: 'score' };
    if (name === 'sentiment') return { table: 'recommendations.sentiment_scores', scoreCol: 'score' };
    throw new Error(`Unsupported model name for scoring: ${name}`);
  }
}
