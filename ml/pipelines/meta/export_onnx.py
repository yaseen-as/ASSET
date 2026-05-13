"""Export the meta-model to ONNX, then verify parity (same pattern as technical)."""

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

from .train import FEATURE_COLS, fetch_component_scores


def export(model_path: str, onnx_path: str, opset: int = 13) -> None:
    booster = lgb.Booster(model_file=model_path)
    initial_type = [("input", FloatTensorType([None, len(FEATURE_COLS)]))]
    onnx_model = convert_lightgbm(booster, initial_types=initial_type, target_opset=opset)
    with open(onnx_path, "wb") as f:
        f.write(onnx_model.SerializeToString())


def verify(model_path: str, onnx_path: str, sample_df: pd.DataFrame, tol: float = 1e-5) -> dict:
    booster = lgb.Booster(model_file=model_path)
    X = sample_df[FEATURE_COLS].to_numpy(dtype=np.float32)
    lgb_pred = booster.predict(X)
    sess = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    raw = sess.run(None, {sess.get_inputs()[0].name: X})
    probs = raw[1]
    onnx_pred = (
        np.array([p[1] for p in probs], dtype=np.float64)
        if isinstance(probs, list)
        else np.asarray(probs)[:, 1].astype(np.float64)
    )
    max_diff = float(np.max(np.abs(lgb_pred - onnx_pred)))
    return {"ok": max_diff <= tol, "max_abs_diff": max_diff, "tolerance": tol, "sample_size": int(len(sample_df))}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="artifacts/meta_model.txt")
    parser.add_argument("--out", default="artifacts/meta_model.onnx")
    parser.add_argument("--opset", type=int, default=13)
    parser.add_argument("--tol", type=float, default=1e-5)
    args = parser.parse_args()

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    export(args.model, args.out, opset=args.opset)
    print(f"Wrote {args.out}")

    # Pull a small recent slice from the DB to verify against the same scores layout.
    from datetime import date, timedelta
    end = date.today()
    start = end - timedelta(days=30)
    sample = fetch_component_scores(start, end).head(200)
    if sample.empty:
        print("WARN: no component scores in recent window — skipping parity verify")
        return
    result = verify(args.model, args.out, sample, tol=args.tol)
    with open(args.out.replace(".onnx", ".verify.json"), "w") as f:
        json.dump(result, f, indent=2)
    print(json.dumps(result, indent=2))
    if not result["ok"]:
        raise SystemExit(f"ONNX parity FAILED: {result['max_abs_diff']:.2e}")


if __name__ == "__main__":
    main()
