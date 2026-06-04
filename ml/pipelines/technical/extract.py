"""Pulls raw OHLCV bars from insights.ohlcv_daily for the training universe."""

from __future__ import annotations

import argparse
import os
from datetime import date, timedelta

import pandas as pd

from ..common.db import read_sql


def fetch_ohlcv(start: date, end: date, exchange: str = "NSE") -> pd.DataFrame:
    """Return long-format OHLCV: one row per (symbol, date)."""
    query = """
        SELECT symbol, exchange, date, open, high, low, close, volume
        FROM insights.ohlcv_daily
        WHERE exchange = %(exchange)s
          AND date BETWEEN %(start)s AND %(end)s
        ORDER BY symbol, date
    """
    df = read_sql(query, params={"exchange": exchange, "start": start, "end": end})
    df["date"] = pd.to_datetime(df["date"])
    for col in ("open", "high", "low", "close"):
        df[col] = df[col].astype("float64")
    df["volume"] = df["volume"].fillna(0).astype("int64")
    return df


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=date.fromisoformat, required=True)
    parser.add_argument("--end", type=date.fromisoformat, required=True)
    parser.add_argument("--exchange", default="NSE")
    parser.add_argument("--out", default="artifacts/raw_ohlcv.parquet")
    args = parser.parse_args()

    df = fetch_ohlcv(args.start, args.end, args.exchange)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    df.to_parquet(args.out, index=False)
    print(f"Wrote {len(df):,} rows for {df['symbol'].nunique()} symbols → {args.out}")


if __name__ == "__main__":
    main()
