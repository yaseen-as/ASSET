"""Export v2 LightGBM booster to ONNX, verify parity. Mirror of v1/export_onnx.py."""

from __future__ import annotations

import argparse
import json
import os

import lightgbm as lgb
import numpy as np
import onnxruntime as ort
import pandas as pd
from onnxmltools import convert_lightgbm
from onnxmltools.convert.common.data_types import FloatTensorType

from .transform import FEATURE_COLS


def export(model_path: str, onnx_path: str, opset: int = 13) -> None:
    booster = lgb.Booster(model_file=model_path)
    initial_type = [("input", FloatTensorType([None, len(FEATURE_COLS)]))]
    onnx_model = convert_lightgbm(booster, initial_types=initial_type, target_opset=opset)
    with open(onnx_path, "wb") as f:
        f.write(onnx_model.SerializeToString())


def verify(model_path: str, onnx_path: str, sample_path: str, n: int = 200, tol: float = 1e-5) -> dict:
    booster = lgb.Booster(model_file=model_path)
    df = pd.read_parquet(sample_path)
    sample = df.sample(min(n, len(df)), random_state=0)
    X = sample[FEATURE_COLS].to_numpy(dtype=np.float32)

    lgb_pred = booster.predict(X)

    sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    input_name = sess.get_inputs()[0].name
    out_names = [o.name for o in sess.get_outputs()]
    raw = sess.run(None, {input_name: X})

    probs = raw[1]
    if isinstance(probs, list):
        onnx_pred = np.array([p[1] for p in probs], dtype=np.float64)
    else:
        onnx_pred = np.asarray(probs)[:, 1].astype(np.float64)

    max_abs_diff = float(np.max(np.abs(lgb_pred - onnx_pred)))
    return {
        "ok": max_abs_diff <= tol,
        "max_abs_diff": max_abs_diff,
        "tolerance": tol,
        "sample_size": int(len(sample)),
        "onnx_output_names": out_names,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="artifacts/technical_v2_model.txt")
    parser.add_argument("--out", default="artifacts/technical_v2_model.onnx")
    parser.add_argument("--sample", default="artifacts/training_set_v2.parquet")
    parser.add_argument("--opset", type=int, default=13)
    parser.add_argument("--tol", type=float, default=1e-5)
    args = parser.parse_args()

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    export(args.model, args.out, opset=args.opset)
    print(f"Wrote {args.out}")

    result = verify(args.model, args.out, args.sample, tol=args.tol)
    with open(args.out.replace(".onnx", ".verify.json"), "w") as f:
        json.dump(result, f, indent=2)
    print(json.dumps(result, indent=2))

    if not result["ok"]:
        raise SystemExit(f"ONNX verification FAILED: max abs diff {result['max_abs_diff']:.2e}")


if __name__ == "__main__":
    main()
