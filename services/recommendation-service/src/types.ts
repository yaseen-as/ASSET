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

export interface FeatureVector {
  symbol: string;
  exchange: string;
  as_of_date: string;
  features: Record<string, number>;
}

export interface ScoreResult {
  symbol: string;
  exchange: string;
  score: number;
  model_id: string;
}
