// Cross-domain ML types — referenced by both `recommendations/` and
// `backtest/`. Anything specific to one domain stays in that domain's
// own types.ts (e.g. ScoreResult, BacktestParams).

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
