"""v2 labels — rank-based instead of binary threshold.

v1 used: label = 1 if forward_return >= 3% else 0
Problem: a 2.99% move and a 3.01% move get opposite labels — wasteful boundary noise.

v2 strategy: rank ALL symbols on each day by their 5-day forward return.
  - label = 1  if symbol is in the TOP quartile of forward returns that day
  - label = 0  if symbol is in the BOTTOM quartile
  - middle quartiles are DROPPED (cleaner signal, less noise)

This converts the task from "predict absolute return ≥ X%" to "predict
relative performance vs other stocks today" — which is what a swing trader
actually wants to know: where to put capital among today's options.

Trade-off: ~50% of rows are dropped (the middle two quartiles). That's fine
— each remaining row is much more informative.
"""

from __future__ import annotations

import argparse
import os

import pandas as pd


def _per_symbol_forward_return(df: pd.DataFrame, horizon: int) -> pd.DataFrame:
    df = df.sort_values("date").copy()
    forward_close = df["close"].shift(-horizon)
    df["forward_return"] = forward_close / df["close"] - 1
    return df


def build_labels(ohlcv: pd.DataFrame, horizon: int = 5) -> pd.DataFrame:
    """Compute forward return per symbol, then per-day rank quartile labels."""
    pieces = []
    for symbol, group in ohlcv.groupby("symbol", group_keys=False):
        piece = _per_symbol_forward_return(group, horizon=horizon)
        piece["symbol"] = symbol
        pieces.append(piece)
    out = pd.concat(pieces, ignore_index=True)

    # Per-day quartile rank of forward_return across symbols
    out = out.dropna(subset=["forward_return"])
    out["fwd_quartile"] = out.groupby("date")["forward_return"].transform(
        lambda x: pd.qcut(x, q=4, labels=False, duplicates="drop")
    )

    # label = 1 if top quartile (3), 0 if bottom (0), NA otherwise (drop middle)
    out["label"] = pd.NA
    out.loc[out["fwd_quartile"] == 3, "label"] = 1
    out.loc[out["fwd_quartile"] == 0, "label"] = 0

    return out


def join_features_labels(features: pd.DataFrame, labels: pd.DataFrame) -> pd.DataFrame:
    """Inner-joins features + labels, drops null labels and null features."""
    label_cols = ["symbol", "exchange", "date", "forward_return", "label"]
    merged = features.merge(labels[label_cols], on=["symbol", "exchange", "date"], how="inner")
    merged = merged.dropna(subset=["label"])

    feature_cols = [c for c in merged.columns
                    if c not in {"symbol", "exchange", "date", "forward_return", "label"}]
    merged = merged.dropna(subset=feature_cols)
    return merged


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ohlcv", default="artifacts/raw_ohlcv.parquet")
    parser.add_argument("--features", default="artifacts/features_technical_v2.parquet")
    parser.add_argument("--out", default="artifacts/training_set_v2.parquet")
    parser.add_argument("--horizon", type=int, default=int(os.environ.get("LABEL_HORIZON_DAYS", "5")))
    args = parser.parse_args()

    ohlcv = pd.read_parquet(args.ohlcv)
    features = pd.read_parquet(args.features)
    labels = build_labels(ohlcv, horizon=args.horizon)
    training = join_features_labels(features, labels)

    pos_rate = float(training["label"].mean())
    print(f"Training rows: {len(training):,}  (top/bottom quartile only)")
    print(f"Positive rate (label=1): {pos_rate:.3f}  (target: ~0.5 — top vs bottom quartile)")
    print(f"Unique symbols: {training['symbol'].nunique()}")
    print(f"Date range: {training['date'].min().date()} → {training['date'].max().date()}")

    training.to_parquet(args.out, index=False)
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
