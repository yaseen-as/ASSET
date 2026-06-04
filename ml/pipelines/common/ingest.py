"""Backfill insights.ohlcv_daily from Yahoo Finance.

Used to seed insights_db when the production Upstox backfill cron isn't
wired yet. Pulls daily OHLCV via yfinance, normalizes to the schema used
by insights.ohlcv_daily, and upserts via ON CONFLICT.

Symbols are passed without the Yahoo suffix — `--exchange NSE` appends `.NS`
and `--exchange BSE` appends `.BO` when querying Yahoo, then the suffix is
stripped before insert so downstream code sees plain tickers.

Usage:
    python -m pipelines.common.ingest \
      --symbols RELIANCE,HDFCBANK,TCS \
      --start 2020-01-01 --end 2026-05-01

    # Or read symbols from a file (one per line):
    python -m pipelines.common.ingest --symbols-file nifty200.txt \
      --start 2020-01-01 --end 2026-05-01
"""

from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

import pandas as pd
import yfinance as yf
from sqlalchemy import text

from .db import conn, engine

YAHOO_SUFFIX = {"NSE": ".NS", "BSE": ".BO"}


def _to_yahoo(symbol: str, exchange: str) -> str:
    return f"{symbol}{YAHOO_SUFFIX[exchange]}"


def _normalize(raw: pd.DataFrame, symbol: str, exchange: str) -> pd.DataFrame:
    """Reshape yfinance output to the ohlcv_daily column set."""
    if raw.empty:
        return raw
    df = raw.reset_index().rename(
        columns={
            "Date": "date",
            "Open": "open",
            "High": "high",
            "Low": "low",
            "Close": "close",
            "Volume": "volume",
        }
    )
    df["symbol"] = symbol
    df["exchange"] = exchange
    df["date"] = pd.to_datetime(df["date"]).dt.date
    df = df.dropna(subset=["open", "high", "low", "close"])
    df["volume"] = df["volume"].fillna(0).astype("int64")
    return df[["symbol", "exchange", "date", "open", "high", "low", "close", "volume"]]


def fetch_one(symbol: str, exchange: str, start: date, end: date) -> pd.DataFrame:
    ticker = _to_yahoo(symbol, exchange)
    raw = yf.download(
        ticker,
        start=start.isoformat(),
        end=end.isoformat(),
        progress=False,
        auto_adjust=False,
        threads=False,
    )
    if isinstance(raw.columns, pd.MultiIndex):
        raw.columns = raw.columns.get_level_values(0)
    return _normalize(raw, symbol, exchange)


def upsert(df: pd.DataFrame) -> int:
    """Bulk upsert into insights.ohlcv_daily. Returns row count written."""
    if df.empty:
        return 0
    records = df.to_dict(orient="records")
    stmt = text(
        """
        INSERT INTO insights.ohlcv_daily
          (symbol, exchange, date, open, high, low, close, volume)
        VALUES
          (:symbol, :exchange, :date, :open, :high, :low, :close, :volume)
        ON CONFLICT (symbol, exchange, date) DO UPDATE SET
          open = EXCLUDED.open,
          high = EXCLUDED.high,
          low = EXCLUDED.low,
          close = EXCLUDED.close,
          volume = EXCLUDED.volume
        """
    )
    with conn() as c:
        with c.begin():
            c.execute(stmt, records)
    return len(records)


def _read_symbols(args: argparse.Namespace) -> list[str]:
    if args.symbols_file:
        path = Path(args.symbols_file)
        return [s.strip().upper() for s in path.read_text().splitlines() if s.strip() and not s.startswith("#")]
    if args.symbols:
        return [s.strip().upper() for s in args.symbols.split(",") if s.strip()]
    raise SystemExit("Provide --symbols CSV or --symbols-file path.")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbols", help="Comma-separated tickers (no exchange suffix), e.g. RELIANCE,TCS")
    parser.add_argument("--symbols-file", help="File with one ticker per line.")
    parser.add_argument("--exchange", default="NSE", choices=["NSE", "BSE"])
    parser.add_argument("--start", type=date.fromisoformat, required=True)
    parser.add_argument("--end", type=date.fromisoformat, required=True)
    args = parser.parse_args()

    symbols = _read_symbols(args)
    print(f"Ingesting {len(symbols)} {args.exchange} symbols from {args.start} to {args.end}")

    # Touch the engine once so a DB misconfig fails fast.
    engine().dispose()

    total = 0
    failed: list[str] = []
    for i, sym in enumerate(symbols, 1):
        try:
            df = fetch_one(sym, args.exchange, args.start, args.end)
            n = upsert(df)
            total += n
            print(f"  [{i}/{len(symbols)}] {sym}: {n} rows")
        except Exception as e:
            failed.append(sym)
            print(f"  [{i}/{len(symbols)}] {sym}: FAILED — {e}")

    print(f"\nDone. {total:,} rows written across {len(symbols) - len(failed)} symbols.")
    if failed:
        print(f"Failed ({len(failed)}): {', '.join(failed)}")


if __name__ == "__main__":
    main()
