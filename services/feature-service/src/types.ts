export interface FeatureVector {
  symbol: string;
  exchange: string;
  as_of_date: string;
  feature_set: string;
  features: Record<string, number>;
}
