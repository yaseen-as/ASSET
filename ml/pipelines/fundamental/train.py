"""Train a LightGBM classifier on fundamental features.

Labels come from the same forward-return rule used by the technical
pipeline (labels.py), so the two models are directly comparable and
their scores can feed the meta-model with no recalibration.
"""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import asdict
from datetime import date

import lightgbm as lgb
import pandas as pd
from sklearn.metrics import roc_auc_score

from ..common.walk_forward import apply_split, make_split
from ..technical.labels import build_labels, join_features_labels
from .transform import FEATURE_COLS


def _fit(train: pd.DataFrame, val: pd.DataFrame) -> lgb.Booster:
    dtrain = lgb.Dataset(train[FEATURE_COLS], label=train["label"].astype(int))
    dval = lgb.Dataset(val[FEATURE_COLS], label=val["label"].astype(int), reference=dtrain)
    params = {
        "objective": "binary",
        "metric": "auc",
        "learning_rate": 0.05,
        "num_leaves": 31,
        "min_data_in_leaf": 300,
        "feature_fraction": 0.9,
        "bagging_fraction": 0.9,
        "bagging_freq": 5,
        "is_unbalance": True,
        "verbosity": -1,
        "seed": 42,
    }
    return lgb.train(
        params,
        dtrain,
        num_boost_round=2000,
        valid_sets=[dtrain, dval],
        valid_names=["train", "val"],
        callbacks=[lgb.early_stopping(50), lgb.log_evaluation(100)],
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", default="artifacts/features_fundamental.parquet")
    parser.add_argument("--ohlcv", default="artifacts/raw_ohlcv.parquet")
    parser.add_argument("--out-dir", default="artifacts")
    parser.add_argument("--reference", type=date.fromisoformat, default=None)
    parser.add_argument("--horizon", type=int, default=int(os.environ.get("LABEL_HORIZON_DAYS", "5")))
    parser.add_argument("--threshold", type=float, default=float(os.environ.get("LABEL_THRESHOLD", "0.03")))
    args = parser.parse_args()

    features = pd.read_parquet(args.features)
    features["date"] = pd.to_datetime(features["date"])

    ohlcv = pd.read_parquet(args.ohlcv)
    labels = build_labels(ohlcv, horizon=args.horizon, threshold=args.threshold)
    df = join_features_labels(features, labels)

    ref = args.reference or df["date"].max().date()
    split = make_split(ref)
    train, val, test = apply_split(df, split)
    if train.empty or val.empty:
        raise SystemExit(f"Empty train ({len(train)}) or val ({len(val)}) split — widen the data range.")

    print(f"Split → train: {len(train):,}  val: {len(val):,}  test: {len(test):,}")
    booster = _fit(train, val)
    val_pred = booster.predict(val[FEATURE_COLS])
    val_auc = float(roc_auc_score(val["label"].astype(int), val_pred))
    print(f"Val AUC: {val_auc:.4f}  (best_iter={booster.best_iteration})")

    os.makedirs(args.out_dir, exist_ok=True)
    model_path = os.path.join(args.out_dir, "fundamental_model.txt")
    booster.save_model(model_path, num_iteration=booster.best_iteration)

    meta = {
        "name": "fundamental",
        "framework": "lightgbm",
        "feature_set": "fundamental_v1",
        "feature_cols": FEATURE_COLS,
        "training_data": {
            "rows": int(len(train) + len(val)),
            "train_range": [str(split.train_start), str(split.train_end)],
            "val_range": [str(split.val_start), str(split.val_end)],
            "test_range": [str(split.test_start), str(split.test_end)],
        },
        "best_iteration": int(booster.best_iteration or 0),
        "val_auc": val_auc,
        "split": {k: str(v) for k, v in asdict(split).items()},
    }
    with open(os.path.join(args.out_dir, "fundamental_model.meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    print(f"Saved model → {model_path}")


if __name__ == "__main__":
    main()
