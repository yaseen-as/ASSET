import * as ort from 'onnxruntime-node';
import { createLogger } from '@platform/shared';
import { config } from '../../config';
import { ModelRegistryRepository } from '../../shared/model-registry.repository';
import type { ModelMeta } from '../../shared/types';

const logger = createLogger('OnnxLoader');

interface LoadedModel {
  session: ort.InferenceSession;
  meta: ModelMeta;
  lastUsed: number;
}

// LRU cache keyed by model_id. ONNX sessions are heavy (50 MB+ resident);
// holding more than a handful exhausts memory on small pods.
export class OnnxLoaderService {
  private cache = new Map<string, LoadedModel>();

  constructor(private readonly registry: ModelRegistryRepository) {}

  async load(modelId: string): Promise<LoadedModel> {
    const hit = this.cache.get(modelId);
    if (hit) {
      hit.lastUsed = Date.now();
      return hit;
    }
    const meta = await this.registry.getById(modelId);
    if (!meta) throw new Error(`Model not in registry: ${modelId}`);
    const bytes = await this.fetchArtifact(meta);
    const session = await ort.InferenceSession.create(bytes, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
    });
    this.evictIfFull();
    const entry: LoadedModel = { session, meta, lastUsed: Date.now() };
    this.cache.set(modelId, entry);
    logger.info(`Loaded model ${meta.name} v${meta.version} (${modelId}), bytes=${bytes.byteLength}`);
    return entry;
  }

  evict(modelId: string): void {
    this.cache.delete(modelId);
  }

  private evictIfFull(): void {
    if (this.cache.size < config.modelCacheSize) return;
    let oldestKey: string | null = null;
    let oldestUsed = Infinity;
    for (const [k, v] of this.cache) {
      if (v.lastUsed < oldestUsed) { oldestUsed = v.lastUsed; oldestKey = k; }
    }
    if (oldestKey) this.cache.delete(oldestKey);
  }

  private async fetchArtifact(meta: ModelMeta): Promise<Buffer> {
    if (meta.artifact_uri.startsWith('pg-bytea://')) {
      return this.registry.getArtifactBytes(meta.id);
    }
    if (meta.artifact_uri.startsWith('file://')) {
      const fs = await import('node:fs/promises');
      return fs.readFile(meta.artifact_uri.replace('file://', ''));
    }
    throw new Error(`Unsupported artifact_uri scheme: ${meta.artifact_uri}`);
  }
}
