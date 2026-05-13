"""Forward-return labels for swing trades.

Label rule (default): y = 1 if close[t + H] / close[t] - 1 >= THRESHOLD else 0.
H = LABEL_HORIZON_DAYS (default 5 trading days)
THRESHOLD = LABEL_THRESHOLD (default 3%)

Important: features computed at date t must use ONLY data dated <= t.
The label uses data from t+1..t+H. Rows where future data is unavailable
(i.e. last H rows per symbol) are dropped.
"""

from __future__ import annotations

import argparse
import os

import numpy as np
import pandas as pd


def _per_symbol_labels(df: pd.DataFrame, horizon: int, threshold: float) -> pd.DataFrame:
    df = df.sort_values("date").copy()
    forward_close = df["close"].shift(-horizon)
    forward_ret = forward_close / df["close"] - 1
    df["forward_return"] = forward_ret
    df["label"] = (forward_ret >= threshold).astype("Int8")
    df.loc[forward_ret.isna(), "label"] = pd.NA
    return df


def build_labels(ohlcv: pd.DataFrame, horizon: int = 5, threshold: float = 0.03) -> pd.DataFrame:
    """Returns OHLCV with `forward_return` and binary `label` columns."""
    return (
        ohlcv.groupby("symbol", group_keys=False)
        .apply(_per_symbol_labels, horizon=horizon, threshold=threshold, include_groups=False)
        .reset_index(drop=True)
    )


def join_features_labels(
    features: pd.DataFrame,
    labels: pd.DataFrame,
) -> pd.DataFrame:
    """Inner-joins features + labels on (symbol, date), drops null labels and null features."""
    label_cols = ["symbol", "exchange", "date", "forward_return", "label"]
    merged = features.merge(labels[label_cols], on=["symbol", "exchange", "date"], how="inner")
    merged = merged.dropna(subset=["label"])
    feature_cols = [c for c in merged.columns if c not in {"symbol", "exchange", "date", "forward_return", "label"}]
    merged = merged.dropna(subset=feature_cols)
    return merged


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ohlcv", default="artifacts/raw_ohlcv.parquet")
    parser.add_argument("--features", default="artifacts/features_technical.parquet")
    parser.add_argument("--out", default="artifacts/training_set.parquet")
    parser.add_argument("--horizon", type=int, default=int(os.environ.get("LABEL_HORIZON_DAYS", "5")))
    parser.add_argument("--threshold", type=float, default=float(os.environ.get("LABEL_THRESHOLD", "0.03")))
    args = parser.parse_args()

    ohlcv = pd.read_parquet(args.ohlcv)
    features = pd.read_parquet(args.features)
    labels = build_labels(ohlcv, horizon=args.horizon, threshold=args.threshold)
    training = join_features_labels(features, labels)

    pos_rate = float(training["label"].mean())
    print(f"Training rows: {len(training):,}")
    print(f"Positive rate (label=1): {pos_rate:.3f} (horizon={args.horizon}d, threshold={args.threshold:.2%})")
    print(f"Unique symbols: {training['symbol'].nunique()}")
    print(f"Date range: {training['date'].min().date()} → {training['date'].max().date()}")

    training.to_parquet(args.out, index=False)
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
