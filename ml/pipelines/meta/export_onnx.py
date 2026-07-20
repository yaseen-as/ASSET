"""Export the meta-model to ONNX, then verify parity (same pattern as technical)."""

from __future__ import annotations

import argparse
import json
import os
from datetime import date, timedelta

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
    parser.add_argument("--start", type=date.fromisoformat, default=None, help="Optional verify sample start date (YYYY-MM-DD)")
    parser.add_argument("--end", type=date.fromisoformat, default=None, help="Optional verify sample end date (YYYY-MM-DD)")
    parser.add_argument("--sample-size", type=int, default=200)
    args = parser.parse_args()

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    export(args.model, args.out, opset=args.opset)
    print(f"Wrote {args.out}")

    # Prefer user-supplied verify window; otherwise, try recent data first.
    verify_end = args.end or date.today()
    verify_start = args.start or (verify_end - timedelta(days=30))
    sample = fetch_component_scores(verify_start, verify_end).head(args.sample_size)

    # If recent window has no rows, fall back to latest available date span.
    if sample.empty:
        from ..common.db import read_sql

        span = read_sql(
            """
            SELECT MIN(date) AS min_date, MAX(date) AS max_date
            FROM insights.ohlcv_daily
            WHERE exchange = 'NSE'
            """
        )
        min_date = span.loc[0, "min_date"]
        max_date = span.loc[0, "max_date"]
        if pd.notna(min_date) and pd.notna(max_date):
            fallback_start = pd.to_datetime(min_date).date()
            fallback_end = pd.to_datetime(max_date).date()
            sample = fetch_component_scores(fallback_start, fallback_end).tail(args.sample_size)
            if not sample.empty:
                print(f"Using fallback verify range {fallback_start}..{fallback_end}")

    if sample.empty:
        print("WARN: no component-score rows available for parity verify")
        return

    result = verify(args.model, args.out, sample, tol=args.tol)
    with open(args.out.replace(".onnx", ".verify.json"), "w") as f:
        json.dump(result, f, indent=2)
    print(json.dumps(result, indent=2))
    if not result["ok"]:
        raise SystemExit(f"ONNX parity FAILED: {result['max_abs_diff']:.2e}")


if __name__ == "__main__":
    main()
