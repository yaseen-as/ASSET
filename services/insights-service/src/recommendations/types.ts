// Re-export shared ML types so existing recommendations/* imports keep
// working. Domain-specific output types stay defined here.
export type { ModelMeta, ModelName, ModelStatus } from '../shared/types';

export interface ScoreResult {
  symbol: string;
  exchange: string;
  score: number;
  model_id: string;
}
