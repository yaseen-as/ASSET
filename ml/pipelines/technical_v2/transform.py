"""v2 feature set — adds cross-sectional ranks, Bollinger Band position,
multi-horizon momentum, and drawdown-from-high.

Key changes vs v1:
  - Cross-sectional features: rank each symbol against all other symbols on
    the same day (relative signal — what swing trading actually trades on).
  - Bollinger Band % position: where price sits within volatility bands.
  - Multi-horizon momentum: ret_1d/3d/60d added — captures regime, not just trend.
  - Drawdown-from-high: how far below a recent peak we are (mean-reversion signal).
  - Drops redundant features: ema_12, ema_26, sma_50 (MACD already covers EMA;
    sma_20 + close_to_sma20 already covers SMA).

All features at row t still use ONLY data dated <= t. No look-ahead.
"""

from __future__ import annotations

import argparse

import numpy as np
import pandas as pd
from ta.momentum import RSIIndicator
from ta.trend import MACD, SMAIndicator
from ta.volatility import AverageTrueRange, BollingerBands


FEATURE_COLS = [
    # === core (kept from v1) ===
    "rsi_14",
    "macd", "macd_signal", "macd_hist",
    "sma_20",
    "ret_5d", "ret_10d", "ret_20d",
    "volatility_20d",
    "atr_14",
    "volume_zscore_20d",
    "close_to_sma20",

    # === new in v2 ===
    "ret_1d", "ret_3d", "ret_60d",                  # multi-horizon momentum
    "bb_pct",                                         # position in Bollinger Bands
    "bb_width",                                       # band width / mean (regime)
    "drawdown_50d",                                   # drawdown from 50d high
    "momentum_quality",                               # ret_20d / volatility_20d (risk-adj)

    # === cross-sectional ranks (computed in build_features after per-symbol pass) ===
    "rsi_rank_day",                                   # rank of rsi_14 across symbols today
    "ret_5d_rank_day",                                # rank of ret_5d across symbols today
    "volume_z_rank_day",                              # rank of volume_zscore_20d today
    "vol_rank_day",                                   # rank of volatility_20d today (low-vol regime?)
]


def _per_symbol(df: pd.DataFrame) -> pd.DataFrame:
    """Compute per-symbol features (no cross-sectional info yet)."""
    df = df.sort_values("date").copy()
    close = df["close"]
    high = df["high"]
    low = df["low"]
    volume = df["volume"]

    # === Momentum ===
    df["rsi_14"] = RSIIndicator(close=close, window=14, fillna=False).rsi()

    # === MACD (covers EMAs 12/26) ===
    macd = MACD(close=close, window_slow=26, window_fast=12, window_sign=9, fillna=False)
    df["macd"] = macd.macd()
    df["macd_signal"] = macd.macd_signal()
    df["macd_hist"] = macd.macd_diff()

    # === Single MA + relative position (dropped sma_50, ema_12, ema_26 as redundant) ===
    df["sma_20"] = SMAIndicator(close=close, window=20, fillna=False).sma_indicator()
    df["close_to_sma20"] = (close / df["sma_20"]) - 1

    # === Multi-horizon returns ===
    df["ret_1d"] = close.pct_change(1)
    df["ret_3d"] = close.pct_change(3)
    df["ret_5d"] = close.pct_change(5)
    df["ret_10d"] = close.pct_change(10)
    df["ret_20d"] = close.pct_change(20)
    df["ret_60d"] = close.pct_change(60)

    # === Volatility ===
    daily_ret = close.pct_change()
    df["volatility_20d"] = daily_ret.rolling(20).std()
    df["atr_14"] = AverageTrueRange(high=high, low=low, close=close, window=14, fillna=False).average_true_range()

    # === Bollinger Bands ===
    bb = BollingerBands(close=close, window=20, window_dev=2, fillna=False)
    upper = bb.bollinger_hband()
    lower = bb.bollinger_lband()
    band_width = (upper - lower)
    # %position: 0 = at lower band, 1 = at upper band, can go outside [0, 1]
    df["bb_pct"] = (close - lower) / band_width.replace(0, np.nan)
    df["bb_width"] = band_width / df["sma_20"]   # normalized — relative band width

    # === Drawdown from recent high ===
    high_50 = close.rolling(50).max()
    df["drawdown_50d"] = (close / high_50) - 1   # negative number, 0 = at high

    # === Risk-adjusted momentum ===
    df["momentum_quality"] = df["ret_20d"] / df["volatility_20d"].replace(0, np.nan)

    # === Volume ===
    vol_mean = volume.rolling(20).mean()
    vol_std = volume.rolling(20).std()
    df["volume_zscore_20d"] = (volume - vol_mean) / vol_std.replace(0, np.nan)

    return df


def _add_cross_sectional_ranks(df: pd.DataFrame) -> pd.DataFrame:
    """Add per-day ranks across all symbols.

    For each (date), rank symbols by various features and normalize to [0, 1].
    This converts absolute readings ("RSI is 65") into relative ones
    ("this stock is in the top 80% of RSI today").
    """
    out = df.copy()

    def _rank_pct(g: pd.Series) -> pd.Series:
        # pct=True normalizes to [0, 1]; method='average' handles ties cleanly.
        return g.rank(pct=True, method="average")

    out["rsi_rank_day"]      = out.groupby("date")["rsi_14"].transform(_rank_pct)
    out["ret_5d_rank_day"]   = out.groupby("date")["ret_5d"].transform(_rank_pct)
    out["volume_z_rank_day"] = out.groupby("date")["volume_zscore_20d"].transform(_rank_pct)
    out["vol_rank_day"]      = out.groupby("date")["volatility_20d"].transform(_rank_pct)

    return out


def build_features(ohlcv: pd.DataFrame) -> pd.DataFrame:
    """Apply per-symbol features, then add cross-sectional ranks."""
    pieces = []
    for symbol, group in ohlcv.groupby("symbol", group_keys=False):
        piece = _per_symbol(group)
        piece["symbol"] = symbol
        pieces.append(piece)
    per_sym = pd.concat(pieces, ignore_index=True)

    with_ranks = _add_cross_sectional_ranks(per_sym)

    keep = ["symbol", "exchange", "date", *FEATURE_COLS]
    return with_ranks[keep]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="inp", default="artifacts/raw_ohlcv.parquet")
    parser.add_argument("--out", default="artifacts/features_technical_v2.parquet")
    args = parser.parse_args()

    ohlcv = pd.read_parquet(args.inp)
    features = build_features(ohlcv)
    features.to_parquet(args.out, index=False)
    print(f"Wrote {len(features):,} rows × {len(FEATURE_COLS)} features → {args.out}")


if __name__ == "__main__":
    main()
