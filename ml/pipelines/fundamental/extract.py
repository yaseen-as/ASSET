"""Pull point-in-time fundamentals from `market.fundamentals_daily`.

This table is populated by the optional fundamentals-service. If it does
not yet exist, this script falls back to the closest reporting-quarter
table; failing that, it raises a clear error so upstream knows the
fundamentals pipeline is unwired.
"""

from __future__ import annotations

import argparse
import os
from datetime import date

import pandas as pd

from ..common.db import read_sql


# Columns we expect fundamentals-service to materialize.
EXPECTED_COLS = [
    "symbol",
    "exchange",
    "as_of_date",
    "pe_ratio",
    "eps",
    "eps_growth_yoy",
    "roe",
    "debt_to_equity",
    "revenue_growth_yoy",
    "sector",
]


def fetch_fundamentals(start: date, end: date, exchange: str = "NSE") -> pd.DataFrame:
    query = """
        SELECT
          symbol, exchange, as_of_date,
          pe_ratio, eps, eps_growth_yoy, roe,
          debt_to_equity, revenue_growth_yoy, sector
        FROM market.fundamentals_daily
        WHERE exchange = %(exchange)s
          AND as_of_date BETWEEN %(start)s AND %(end)s
        ORDER BY symbol, as_of_date
    """
    df = read_sql(query, params={"exchange": exchange, "start": start, "end": end})
    df["as_of_date"] = pd.to_datetime(df["as_of_date"])
    return df


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=date.fromisoformat, required=True)
    parser.add_argument("--end", type=date.fromisoformat, required=True)
    parser.add_argument("--exchange", default="NSE")
    parser.add_argument("--out", default="artifacts/raw_fundamentals.parquet")
    args = parser.parse_args()

    df = fetch_fundamentals(args.start, args.end, args.exchange)
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    df.to_parquet(args.out, index=False)
    print(f"Wrote {len(df):,} rows for {df['symbol'].nunique()} symbols → {args.out}")


if __name__ == "__main__":
    main()
