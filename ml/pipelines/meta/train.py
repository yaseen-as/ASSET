"""Train the meta-model.

Inputs: per-symbol per-date scores from technical_scores, fundamental_scores,
sentiment_scores. Output: a LightGBM classifier that turns three scores in
[0,1] into a single ranking score in [0,1] — the meta_v1 feature_set.

Label: same forward-return rule used by the component models. This way the
meta-model is calibrated against the same ground truth.
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

from ..common.db import read_sql
from ..common.walk_forward import apply_split, make_split
from ..technical.labels import build_labels


FEATURE_COLS = ["technical_score", "fundamental_score", "sentiment_score"]


def fetch_component_scores(start: date, end: date, exchange: str = "NSE") -> pd.DataFrame:
    query = """
        WITH t AS (
          SELECT symbol, exchange, as_of_date, AVG(score) AS technical_score
          FROM recommendations.technical_scores
          WHERE exchange = %(exchange)s AND as_of_date BETWEEN %(start)s AND %(end)s
          GROUP BY symbol, exchange, as_of_date
        ),
        f AS (
          SELECT symbol, exchange, as_of_date, AVG(score) AS fundamental_score
          FROM recommendations.fundamental_scores
          WHERE exchange = %(exchange)s AND as_of_date BETWEEN %(start)s AND %(end)s
          GROUP BY symbol, exchange, as_of_date
        ),
        sen AS (
          SELECT symbol, exchange, as_of_date, AVG(score) AS sentiment_score
          FROM recommendations.sentiment_scores
          WHERE exchange = %(exchange)s AND as_of_date BETWEEN %(start)s AND %(end)s
          GROUP BY symbol, exchange, as_of_date
        )
        SELECT
          COALESCE(t.symbol, f.symbol, sen.symbol) AS symbol,
          COALESCE(t.exchange, f.exchange, sen.exchange) AS exchange,
          COALESCE(t.as_of_date, f.as_of_date, sen.as_of_date) AS date,
          t.technical_score,
          f.fundamental_score,
          sen.sentiment_score
        FROM t
        FULL OUTER JOIN f USING (symbol, exchange, as_of_date)
        FULL OUTER JOIN sen USING (symbol, exchange, as_of_date)
    """
    df = read_sql(query, params={"start": start, "end": end, "exchange": exchange})
    df["date"] = pd.to_datetime(df["date"])
    # Fill missing component scores with 0.5 (neutral) so the meta-model
    # learns to give them less weight when sparse. Alternative: drop rows
    # without all three — keeps the dataset cleaner but smaller.
    for c in FEATURE_COLS:
        df[c] = df[c].fillna(0.5).astype("float64")
    return df


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=date.fromisoformat, required=True)
    parser.add_argument("--end", type=date.fromisoformat, required=True)
    parser.add_argument("--exchange", default="NSE")
    parser.add_argument("--ohlcv", default="artifacts/raw_ohlcv.parquet")
    parser.add_argument("--out-dir", default="artifacts")
    parser.add_argument("--horizon", type=int, default=int(os.environ.get("LABEL_HORIZON_DAYS", "5")))
    parser.add_argument("--threshold", type=float, default=float(os.environ.get("LABEL_THRESHOLD", "0.03")))
    args = parser.parse_args()

    scores = fetch_component_scores(args.start, args.end, args.exchange)
    ohlcv = pd.read_parquet(args.ohlcv)
    labels = build_labels(ohlcv, horizon=args.horizon, threshold=args.threshold)
    df = scores.merge(labels[["symbol", "exchange", "date", "label"]], on=["symbol", "exchange", "date"], how="inner")
    df = df.dropna(subset=["label"])
    if df.empty:
        raise SystemExit("No labeled rows after joining component scores with labels.")

    ref = df["date"].max().date()
    split = make_split(ref)
    train, val, test = apply_split(df, split)
    if train.empty or val.empty:
        raise SystemExit(f"Empty train ({len(train)}) or val ({len(val)}) split.")

    dtrain = lgb.Dataset(train[FEATURE_COLS], label=train["label"].astype(int))
    dval = lgb.Dataset(val[FEATURE_COLS], label=val["label"].astype(int), reference=dtrain)
    params = {
        "objective": "binary", "metric": "auc",
        "learning_rate": 0.03, "num_leaves": 7, "min_data_in_leaf": 500,
        "feature_fraction": 1.0, "bagging_fraction": 0.9, "bagging_freq": 5,
        "is_unbalance": True, "verbosity": -1, "seed": 42,
    }
    booster = lgb.train(
        params, dtrain, num_boost_round=1000,
        valid_sets=[dtrain, dval], valid_names=["train", "val"],
        callbacks=[lgb.early_stopping(40), lgb.log_evaluation(50)],
    )

    val_auc = float(roc_auc_score(val["label"].astype(int), booster.predict(val[FEATURE_COLS])))
    print(f"Val AUC: {val_auc:.4f}  (best_iter={booster.best_iteration})")

    os.makedirs(args.out_dir, exist_ok=True)
    model_path = os.path.join(args.out_dir, "meta_model.txt")
    booster.save_model(model_path, num_iteration=booster.best_iteration)

    meta = {
        "name": "meta", "framework": "lightgbm",
        "feature_set": "meta_v1", "feature_cols": FEATURE_COLS,
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
    with open(os.path.join(args.out_dir, "meta_model.meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    print(f"Saved model → {model_path}")


if __name__ == "__main__":
    main()
