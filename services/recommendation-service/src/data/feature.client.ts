import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import type { FeatureVector } from '../types';

// Thin HTTP client onto feature-service. Recommendation-service never queries
// feature_store directly — that's feature-service's bounded context.
export class FeatureClient {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({ baseURL: config.featureServiceUrl, timeout: 10_000 });
  }

  async getOne(exchange: string, symbol: string, date: string, featureSet: string): Promise<FeatureVector | null> {
    try {
      const { data } = await this.http.get(`/features/${exchange}/${symbol}`, {
        params: { date, set: featureSet },
      });
      return data.data;
    } catch (err: any) {
      if (err.response?.status === 404) return null;
      throw err;
    }
  }

  async getBatch(exchange: string, date: string, featureSet: string, symbols?: string[]): Promise<FeatureVector[]> {
    const { data } = await this.http.get('/features/batch', {
      params: { exchange, date, set: featureSet, symbols: symbols?.join(',') },
    });
    return data.data;
  }
}
