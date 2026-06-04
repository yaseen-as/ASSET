"""Builds the technical feature set from raw OHLCV.

All features computed at row t use ONLY data dated <= t. No look-ahead.
"""

from __future__ import annotations

import argparse

import numpy as np
import pandas as pd
from ta.momentum import RSIIndicator
from ta.trend import MACD, EMAIndicator, SMAIndicator
from ta.volatility import AverageTrueRange


FEATURE_COLS = [
    "rsi_14",
    "macd",
    "macd_signal",
    "macd_hist",
    "sma_20",
    "sma_50",
    "ema_12",
    "ema_26",
    "ret_5d",
    "ret_10d",
    "ret_20d",
    "volatility_20d",
    "atr_14",
    "volume_zscore_20d",
    "close_to_sma20",
    "close_to_sma50",
]


def _per_symbol(df: pd.DataFrame) -> pd.DataFrame:
    """Compute features for one symbol's chronological frame."""
    df = df.sort_values("date").copy()
    close = df["close"]
    high = df["high"]
    low = df["low"]
    volume = df["volume"]

    # Momentum
    df["rsi_14"] = RSIIndicator(close=close, window=14, fillna=False).rsi()

    # MACD
    macd = MACD(close=close, window_slow=26, window_fast=12, window_sign=9, fillna=False)
    df["macd"] = macd.macd()
    df["macd_signal"] = macd.macd_signal()
    df["macd_hist"] = macd.macd_diff()

    # Moving averages
    df["sma_20"] = SMAIndicator(close=close, window=20, fillna=False).sma_indicator()
    df["sma_50"] = SMAIndicator(close=close, window=50, fillna=False).sma_indicator()
    df["ema_12"] = EMAIndicator(close=close, window=12, fillna=False).ema_indicator()
    df["ema_26"] = EMAIndicator(close=close, window=26, fillna=False).ema_indicator()

    # Returns
    df["ret_5d"] = close.pct_change(5)
    df["ret_10d"] = close.pct_change(10)
    df["ret_20d"] = close.pct_change(20)

    # Volatility (20d rolling std of daily returns)
    daily_ret = close.pct_change()
    df["volatility_20d"] = daily_ret.rolling(20).std()

    # ATR
    df["atr_14"] = AverageTrueRange(high=high, low=low, close=close, window=14, fillna=False).average_true_range()

    # Volume z-score (20d)
    vol_mean = volume.rolling(20).mean()
    vol_std = volume.rolling(20).std()
    df["volume_zscore_20d"] = (volume - vol_mean) / vol_std.replace(0, np.nan)

    # Price vs MAs (ratio - 1)
    df["close_to_sma20"] = (close / df["sma_20"]) - 1
    df["close_to_sma50"] = (close / df["sma_50"]) - 1

    return df


def build_features(ohlcv: pd.DataFrame) -> pd.DataFrame:
    """Apply per-symbol feature engineering across the whole universe."""
    pieces = []
    for symbol, group in ohlcv.groupby("symbol", group_keys=False):
        piece = _per_symbol(group)
        piece["symbol"] = symbol
        pieces.append(piece)
    out = pd.concat(pieces, ignore_index=True)
    keep = ["symbol", "exchange", "date", *FEATURE_COLS]
    return out[keep]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="inp", default="artifacts/raw_ohlcv.parquet")
    parser.add_argument("--out", default="artifacts/features_technical.parquet")
    args = parser.parse_args()

    ohlcv = pd.read_parquet(args.inp)
    features = build_features(ohlcv)
    features.to_parquet(args.out, index=False)
    print(f"Wrote {len(features):,} rows × {len(FEATURE_COLS)} features → {args.out}")


if __name__ == "__main__":
    main()
