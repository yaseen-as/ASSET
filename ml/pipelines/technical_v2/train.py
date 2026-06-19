"""Train a LightGBM classifier on the v2 training set.

Identical to v1/train.py except:
  - Reads training_set_v2.parquet
  - Uses v2 FEATURE_COLS (24 features instead of 16)
  - Writes technical_v2_model.* artifacts
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
from .transform import FEATURE_COLS


def _fit(train: pd.DataFrame, val: pd.DataFrame) -> lgb.Booster:
    dtrain = lgb.Dataset(train[FEATURE_COLS], label=train["label"].astype(int))
    dval = lgb.Dataset(val[FEATURE_COLS], label=val["label"].astype(int), reference=dtrain)

    params = {
        "objective": "binary",
        "metric": "auc",
        "learning_rate": 0.03,           # slightly lower than v1 (more rounds to converge)
        "num_leaves": 31,                # less complex than v1's 63 — combat overfitting
        "min_data_in_leaf": 300,         # higher than v1's 200 — more regularization
        "feature_fraction": 0.7,         # randomly drop 30% of features per tree
        "bagging_fraction": 0.8,
        "bagging_freq": 5,
        "lambda_l2": 1.0,                # L2 regularization (new vs v1)
        "is_unbalance": True,
        "verbosity": -1,
        "seed": 42,
    }

    return lgb.train(
        params,
        dtrain,
        num_boost_round=3000,
        valid_sets=[dtrain, dval],
        valid_names=["train", "val"],
        callbacks=[lgb.early_stopping(100), lgb.log_evaluation(100)],
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="inp", default="artifacts/training_set_v2.parquet")
    parser.add_argument("--out-dir", default="artifacts")
    parser.add_argument("--reference", type=date.fromisoformat, default=None)
    args = parser.parse_args()

    df = pd.read_parquet(args.inp)
    df["date"] = pd.to_datetime(df["date"])

    ref = args.reference or df["date"].max().date()
    split = make_split(ref)
    train, val, test = apply_split(df, split)
    if train.empty or val.empty:
        raise SystemExit(f"Empty train ({len(train)}) or val ({len(val)}) split.")

    print(f"Split → train: {len(train):,}  val: {len(val):,}  test: {len(test):,}")

    booster = _fit(train, val)

    val_pred = booster.predict(val[FEATURE_COLS])
    val_auc = float(roc_auc_score(val["label"].astype(int), val_pred))
    print(f"Val AUC: {val_auc:.4f}  (best_iter={booster.best_iteration})")

    os.makedirs(args.out_dir, exist_ok=True)
    model_path = os.path.join(args.out_dir, "technical_v2_model.txt")
    booster.save_model(model_path, num_iteration=booster.best_iteration)

    meta = {
        "name": "technical_v2",
        "framework": "lightgbm",
        "feature_set": "technical_v2",
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
    with open(os.path.join(args.out_dir, "technical_v2_model.meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    print(f"Saved model → {model_path}")


if __name__ == "__main__":
    main()
