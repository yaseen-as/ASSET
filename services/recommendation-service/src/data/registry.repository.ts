import { db } from '../config/database';
import type { ModelMeta, ModelName, ModelStatus } from '../types';

interface RegistryRow {
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
  created_at: Date;
  promoted_at: Date | null;
}

export class RegistryRepository {
  async getActive(name: ModelName): Promise<ModelMeta | null> {
    const r = (await db('recommendations.model_registry')
      .where({ name })
      .whereIn('status', ['production', 'canary'])
      .orderByRaw(`CASE status WHEN 'production' THEN 0 ELSE 1 END, rollout_percent DESC, promoted_at DESC NULLS LAST`)
      .first()) as RegistryRow | undefined;
    return r ? this.toMeta(r) : null;
  }

  async getById(id: string): Promise<ModelMeta | null> {
    const r = (await db('recommendations.model_registry').where({ id }).first()) as RegistryRow | undefined;
    return r ? this.toMeta(r) : null;
  }

  async list(name?: ModelName): Promise<ModelMeta[]> {
    const q = db('recommendations.model_registry').orderBy('created_at', 'desc');
    if (name) q.where({ name });
    const rows = (await q) as RegistryRow[];
    return rows.map((r) => this.toMeta(r));
  }

  async getArtifactBytes(modelId: string): Promise<Buffer> {
    const r = await db('recommendations.model_artifacts').select('bytes').where({ model_id: modelId }).first();
    if (!r) throw new Error(`Artifact not found for model ${modelId}`);
    return r.bytes as Buffer;
  }

  async updateStatus(id: string, status: ModelStatus, rolloutPercent: number): Promise<void> {
    await db('recommendations.model_registry')
      .where({ id })
      .update({
        status,
        rollout_percent: rolloutPercent,
        promoted_at: status === 'production' || status === 'canary' ? db.fn.now() : null,
      });
  }

  private toMeta(r: RegistryRow): ModelMeta {
    return {
      id: r.id,
      name: r.name,
      version: r.version,
      framework: r.framework,
      artifact_uri: r.artifact_uri,
      feature_set: r.feature_set,
      training_data: r.training_data,
      metrics: r.metrics,
      status: r.status,
      rollout_percent: r.rollout_percent,
      created_at: r.created_at.toISOString(),
      promoted_at: r.promoted_at ? r.promoted_at.toISOString() : null,
    };
  }
}
