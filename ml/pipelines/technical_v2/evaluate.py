"""Evaluate v2 model on held-out test split. Mirror of v1/evaluate.py."""

from __future__ import annotations

import argparse
import json
import os

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import roc_auc_score

from ..common.walk_forward import apply_split, make_split
from .transform import FEATURE_COLS


def precision_at_k_per_day(df: pd.DataFrame, k: int) -> float:
    def _day(g: pd.DataFrame) -> float:
        top = g.nlargest(k, "pred")
        return top["label"].astype(int).mean() if len(top) else np.nan
    return float(df.groupby("date").apply(_day, include_groups=False).mean())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--training-set", default="artifacts/training_set_v2.parquet")
    parser.add_argument("--model", default="artifacts/technical_v2_model.txt")
    parser.add_argument("--meta", default="artifacts/technical_v2_model.meta.json")
    parser.add_argument("--out", default="artifacts/technical_v2_model.eval.json")
    parser.add_argument("--k", type=int, nargs="+", default=[10, 20, 50])
    args = parser.parse_args()

    df = pd.read_parquet(args.training_set)
    df["date"] = pd.to_datetime(df["date"])

    with open(args.meta) as f:
        meta = json.load(f)
    ref = pd.to_datetime(meta["split"]["test_end"]).date()
    split = make_split(ref)
    _, _, test = apply_split(df, split)
    if test.empty:
        raise SystemExit("Test split is empty.")

    booster = lgb.Booster(model_file=args.model)
    test = test.copy()
    test["pred"] = booster.predict(test[FEATURE_COLS])

    auc = float(roc_auc_score(test["label"].astype(int), test["pred"]))
    baseline = float(test["label"].astype(int).mean())

    p_at_k = {f"p@{k}": precision_at_k_per_day(test, k) for k in args.k}
    lift = {f"lift@{k}": (p_at_k[f"p@{k}"] / baseline) if baseline > 0 else float("nan") for k in args.k}

    test["decile"] = pd.qcut(test["pred"], q=10, labels=False, duplicates="drop")
    deciles = test.groupby("decile")["label"].mean().to_dict() if "decile" in test.columns else {}

    report = {
        "test_rows": int(len(test)),
        "test_baseline_positive_rate": baseline,
        "auc": auc,
        **p_at_k,
        **lift,
        "decile_positive_rate": {int(k): float(v) for k, v in deciles.items()},
    }

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w") as f:
        json.dump(report, f, indent=2)

    print(json.dumps(report, indent=2))
    print(f"\nWrote {args.out}")


if __name__ == "__main__":
    main()
