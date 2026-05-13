"""Build the fundamental feature set.

Most fundamentals come pre-cleaned from fundamentals-service. The
transform step adds derived signals: sector-relative ranks (so that PE
of 18 is "cheap" in IT but "expensive" in FMCG) and winsorized values
to dampen outliers.
"""

from __future__ import annotations

import argparse

import numpy as np
import pandas as pd


FEATURE_COLS = [
    "pe_ratio_w",
    "eps_w",
    "eps_growth_yoy_w",
    "roe_w",
    "debt_to_equity_w",
    "revenue_growth_yoy_w",
    "pe_rank_in_sector",
    "roe_rank_in_sector",
    "eps_growth_rank_in_sector",
]

NUMERIC_COLS = [
    "pe_ratio",
    "eps",
    "eps_growth_yoy",
    "roe",
    "debt_to_equity",
    "revenue_growth_yoy",
]


def _winsorize(s: pd.Series, p: float = 0.01) -> pd.Series:
    lo, hi = s.quantile(p), s.quantile(1 - p)
    return s.clip(lo, hi)


def _rank_within(df: pd.DataFrame, value_col: str, by: str) -> pd.Series:
    return df.groupby(by)[value_col].rank(pct=True, method="average")


def build_features(raw: pd.DataFrame) -> pd.DataFrame:
    df = raw.copy()

    # Per-day winsorization keeps tails from dominating the model
    for col in NUMERIC_COLS:
        df[f"{col}_w"] = df.groupby("as_of_date")[col].transform(_winsorize)

    df["pe_rank_in_sector"] = _rank_within(df, "pe_ratio_w", "sector")
    df["roe_rank_in_sector"] = _rank_within(df, "roe_w", "sector")
    df["eps_growth_rank_in_sector"] = _rank_within(df, "eps_growth_yoy_w", "sector")

    out = df[["symbol", "exchange", "as_of_date", *FEATURE_COLS]].copy()
    out = out.rename(columns={"as_of_date": "date"})
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="inp", default="artifacts/raw_fundamentals.parquet")
    parser.add_argument("--out", default="artifacts/features_fundamental.parquet")
    args = parser.parse_args()

    raw = pd.read_parquet(args.inp)
    features = build_features(raw)
    features.to_parquet(args.out, index=False)
    print(f"Wrote {len(features):,} rows × {len(FEATURE_COLS)} features → {args.out}")


if __name__ == "__main__":
    main()
