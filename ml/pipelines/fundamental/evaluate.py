"""Evaluate the fundamental model on its held-out test split.

Reuses the per-day precision@K helper from the technical pipeline to keep
metric definitions identical across models.
"""

from __future__ import annotations

import argparse
import json
import os

import lightgbm as lgb
import pandas as pd
from sklearn.metrics import roc_auc_score

from ..common.walk_forward import apply_split, make_split
from ..technical.evaluate import precision_at_k_per_day
from ..technical.labels import build_labels, join_features_labels
from .transform import FEATURE_COLS


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", default="artifacts/features_fundamental.parquet")
    parser.add_argument("--ohlcv", default="artifacts/raw_ohlcv.parquet")
    parser.add_argument("--model", default="artifacts/fundamental_model.txt")
    parser.add_argument("--meta", default="artifacts/fundamental_model.meta.json")
    parser.add_argument("--out", default="artifacts/fundamental_model.eval.json")
    parser.add_argument("--k", type=int, nargs="+", default=[10, 20, 50])
    parser.add_argument("--horizon", type=int, default=int(os.environ.get("LABEL_HORIZON_DAYS", "5")))
    parser.add_argument("--threshold", type=float, default=float(os.environ.get("LABEL_THRESHOLD", "0.03")))
    args = parser.parse_args()

    features = pd.read_parquet(args.features)
    features["date"] = pd.to_datetime(features["date"])
    ohlcv = pd.read_parquet(args.ohlcv)
    labels = build_labels(ohlcv, horizon=args.horizon, threshold=args.threshold)
    df = join_features_labels(features, labels)

    with open(args.meta) as f:
        meta = json.load(f)
    ref = pd.to_datetime(meta["split"]["test_end"]).date()
    _, _, test = apply_split(df, make_split(ref))
    if test.empty:
        raise SystemExit("Test split is empty.")

    booster = lgb.Booster(model_file=args.model)
    test = test.copy()
    test["pred"] = booster.predict(test[FEATURE_COLS])

    auc = float(roc_auc_score(test["label"].astype(int), test["pred"]))
    baseline = float(test["label"].astype(int).mean())
    p = {f"p@{k}": precision_at_k_per_day(test, k) for k in args.k}
    lift = {f"lift@{k}": (p[f"p@{k}"] / baseline) if baseline > 0 else float("nan") for k in args.k}

    report = {
        "test_rows": int(len(test)),
        "test_baseline_positive_rate": baseline,
        "auc": auc,
        **p,
        **lift,
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(report, f, indent=2)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
