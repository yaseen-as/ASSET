import * as ort from 'onnxruntime-node';
import type { FeatureVector, ModelMeta } from '../types';
import { OnnxLoaderService } from './onnx-loader.service';

// Reads feature_cols from training_data.feature_cols on the registry row.
// Order matters — the ONNX model expects features in this exact order.
function getFeatureCols(meta: ModelMeta): string[] {
  const cols = (meta.training_data as any)?.feature_cols;
  if (!Array.isArray(cols) || cols.length === 0) {
    throw new Error(`Model ${meta.id} has no training_data.feature_cols`);
  }
  return cols as string[];
}

// LightGBM ONNX classifiers expose two outputs:
//   [0] labels (Int64 tensor)
//   [1] probabilities — either an ndarray [N, 2] or a list-of-maps depending
//       on the onnxmltools converter version. Handle both.
function extractPositiveProb(output: ort.InferenceSession.OnnxValueMapType): number[] {
  const keys = Object.keys(output);
  // Try the typical 2nd-output (probabilities) first.
  const probsTensor = output[keys[1]] as any;
  // Case A: list-of-maps converter
  if (Array.isArray(probsTensor)) {
    return probsTensor.map((m: Record<string, number>) => m[1] ?? m['1']);
  }
  // Case B: ndarray [N, 2]
  const data = probsTensor.data as Float32Array;
  const dims = probsTensor.dims as number[];
  const cols = dims[1];
  const out: number[] = [];
  for (let i = 0; i < data.length; i += cols) out.push(data[i + 1]);
  return out;
}

export class InferenceService {
  constructor(private readonly loader: OnnxLoaderService) {}

  async scoreBatch(modelMeta: ModelMeta, vectors: FeatureVector[]): Promise<number[]> {
    if (vectors.length === 0) return [];
    const loaded = await this.loader.load(modelMeta.id);
    const cols = getFeatureCols(loaded.meta);

    const flat = new Float32Array(vectors.length * cols.length);
    let missing = 0;
    for (let i = 0; i < vectors.length; i++) {
      const f = vectors[i].features;
      for (let j = 0; j < cols.length; j++) {
        const v = f[cols[j]];
        if (v === undefined || v === null || Number.isNaN(v)) { missing++; flat[i * cols.length + j] = 0; }
        else flat[i * cols.length + j] = v;
      }
    }
    if (missing > 0 && missing / flat.length > 0.05) {
      throw new Error(`Too many missing features (${missing}/${flat.length}); refusing to predict`);
    }

    const inputName = loaded.session.inputNames[0];
    const tensor = new ort.Tensor('float32', flat, [vectors.length, cols.length]);
    const output = await loaded.session.run({ [inputName]: tensor });
    return extractPositiveProb(output);
  }

  async scoreOne(modelMeta: ModelMeta, vec: FeatureVector): Promise<number> {
    const [s] = await this.scoreBatch(modelMeta, [vec]);
    return s;
  }
}
