"""Ingest news headlines for the sentiment pipeline.

By default, pulls recent news from Yahoo Finance via yfinance's `Ticker.news`
for each symbol and stores rows in `insights.news_headlines`.

Optional file mode lets you load a CSV/JSON/JSONL file with at least:
  symbol, exchange, headline, published_at
and optional:
  source, url

Usage:
    # Yahoo fetch mode
    python -m pipelines.sentiment.ingest \
      --symbols RELIANCE,TCS,INFY \
      --exchange NSE \
      --start 2026-05-01 --end 2026-05-13

    # File mode
    python -m pipelines.sentiment.ingest \
      --input ./news.csv \
      --start 2026-05-01 --end 2026-05-13
"""

from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd
import yfinance as yf
from sqlalchemy import text

from ..common.db import conn, engine

YAHOO_SUFFIX = {"NSE": ".NS", "BSE": ".BO"}
REQUIRED_COLUMNS = ["symbol", "exchange", "headline", "published_at"]


def _to_yahoo(symbol: str, exchange: str) -> str:
    return f"{symbol}{YAHOO_SUFFIX[exchange]}"


def _read_symbols(args: argparse.Namespace) -> list[str]:
    if args.symbols_file:
        path = Path(args.symbols_file)
        return [s.strip().upper() for s in path.read_text().splitlines() if s.strip() and not s.startswith("#")]
    if args.symbols:
        return [s.strip().upper() for s in args.symbols.split(",") if s.strip()]
    raise SystemExit("Provide --symbols CSV or --symbols-file path for Yahoo fetch mode.")


def _normalize_frame(df: pd.DataFrame) -> pd.DataFrame:
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Input file is missing required columns: {', '.join(missing)}")

    out = df.copy()
    out["symbol"] = out["symbol"].astype("string").str.strip().str.upper()
    out["exchange"] = out["exchange"].astype("string").str.strip().str.upper()
    out["headline"] = out["headline"].astype("string").str.strip()
    out["published_at"] = pd.to_datetime(out["published_at"], utc=True, errors="coerce")
    if "source" not in out.columns:
        out["source"] = ""
    if "url" not in out.columns:
        out["url"] = ""

    out["source"] = out["source"].astype("string").fillna("")
    out["url"] = out["url"].astype("string").fillna("")
    out = out.dropna(subset=["symbol", "exchange", "headline", "published_at"])
    out = out[out["headline"] != ""]

    out = out[["symbol", "exchange", "headline", "source", "url", "published_at"]]
    out = out.drop_duplicates(subset=["symbol", "exchange", "headline", "published_at"])
    return out


def _read_input_file(path: str) -> pd.DataFrame:
    file_path = Path(path).expanduser().resolve()
    if not file_path.exists():
        raise SystemExit(
            "Input file not found: "
            f"{file_path}\n"
            "Provide a real file path, for example: ml/pipelines/sentiment/historical_news.sample.csv"
        )
    if not file_path.is_file():
        raise SystemExit(f"Input path is not a file: {file_path}")

    suffix = file_path.suffix.lower()
    if suffix == ".csv":
        raw = pd.read_csv(file_path)
    elif suffix == ".json":
        raw = pd.read_json(file_path)
    elif suffix == ".jsonl":
        raw = pd.read_json(file_path, lines=True)
    else:
        raise ValueError("Unsupported input format. Use .csv, .json, or .jsonl")
    return _normalize_frame(raw)


def _extract_item(item: dict[str, Any], symbol: str, exchange: str) -> dict[str, Any] | None:
    # yfinance payloads vary by version:
    # - old: top-level title/providerPublishTime/link/publisher
    # - new: nested content.title/content.pubDate/content.clickThroughUrl.url
    content = item.get("content") if isinstance(item.get("content"), dict) else {}

    title = str(item.get("title") or content.get("title") or "").strip()
    if not title:
        return None

    ts = item.get("providerPublishTime")
    published_at = pd.NaT
    if ts is not None:
        published_at = pd.to_datetime(ts, unit="s", utc=True, errors="coerce")
    elif content:
        published_at = pd.to_datetime(content.get("pubDate") or content.get("displayTime"), utc=True, errors="coerce")
    if pd.isna(published_at):
        return None

    provider = content.get("provider") if isinstance(content.get("provider"), dict) else {}
    canonical = content.get("canonicalUrl") if isinstance(content.get("canonicalUrl"), dict) else {}
    click_through = content.get("clickThroughUrl") if isinstance(content.get("clickThroughUrl"), dict) else {}

    return {
        "symbol": symbol,
        "exchange": exchange,
        "headline": title,
        "source": str(item.get("publisher") or provider.get("displayName") or "yahoo").strip(),
        "url": str(item.get("link") or click_through.get("url") or canonical.get("url") or "").strip(),
        "published_at": published_at,
    }


def fetch_yahoo(symbol: str, exchange: str) -> pd.DataFrame:
    ticker = _to_yahoo(symbol, exchange)
    t = yf.Ticker(ticker)
    news = t.news or []

    rows: list[dict[str, Any]] = []
    for item in news:
        if not isinstance(item, dict):
            continue
        row = _extract_item(item, symbol, exchange)
        if row is not None:
            rows.append(row)

    if not rows:
        return pd.DataFrame(columns=["symbol", "exchange", "headline", "source", "url", "published_at"])

    return _normalize_frame(pd.DataFrame(rows))


def _filter_date_window(df: pd.DataFrame, start: date, end: date) -> pd.DataFrame:
    if df.empty:
        return df
    dates = df["published_at"].dt.date
    return df[(dates >= start) & (dates <= end)].copy()


def _date_span(df: pd.DataFrame) -> str:
    if df.empty:
        return "n/a"
    min_dt = pd.to_datetime(df["published_at"], utc=True, errors="coerce").min()
    max_dt = pd.to_datetime(df["published_at"], utc=True, errors="coerce").max()
    if pd.isna(min_dt) or pd.isna(max_dt):
        return "n/a"
    return f"{min_dt.date()}..{max_dt.date()}"


def upsert(df: pd.DataFrame) -> int:
    """Insert headlines and skip already-existing duplicates."""
    if df.empty:
        return 0

    stmt = text(
        """
        INSERT INTO insights.news_headlines
          (symbol, exchange, headline, source, url, published_at)
        SELECT
          :symbol, :exchange, :headline, :source, :url, :published_at
        WHERE NOT EXISTS (
          SELECT 1
          FROM insights.news_headlines nh
          WHERE nh.symbol = :symbol
            AND nh.exchange = :exchange
            AND nh.headline = :headline
            AND nh.published_at = :published_at
        )
        """
    )

    inserted = 0
    with conn() as c:
        with c.begin():
            for row in df.to_dict(orient="records"):
                result = c.execute(stmt, row)
                inserted += int(result.rowcount or 0)
    return inserted


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", help="Optional input file (.csv/.json/.jsonl) with headline rows.")
    parser.add_argument("--symbols", help="Comma-separated tickers for Yahoo mode, e.g. RELIANCE,TCS")
    parser.add_argument("--symbols-file", help="File with one ticker per line for Yahoo mode.")
    parser.add_argument("--exchange", default="NSE", choices=["NSE", "BSE"], help="Exchange for Yahoo mode.")
    parser.add_argument("--start", type=date.fromisoformat, required=True)
    parser.add_argument("--end", type=date.fromisoformat, required=True)
    args = parser.parse_args()

    if args.start > args.end:
        raise SystemExit("--start must be <= --end")

    # Touch the engine once so DB/env errors fail fast.
    engine().dispose()

    if args.input:
        rows = _read_input_file(args.input)
        rows = _filter_date_window(rows, args.start, args.end)
        n = upsert(rows)
        print(f"Inserted {n} headlines from file ({len(rows)} candidate rows in date window).")
        return

    symbols = _read_symbols(args)
    print(f"Fetching Yahoo headlines for {len(symbols)} {args.exchange} symbols from {args.start} to {args.end}")

    total_inserted = 0
    total_candidates = 0
    failed: list[str] = []
    for i, sym in enumerate(symbols, 1):
        try:
            fetched = fetch_yahoo(sym, args.exchange)
            filtered = _filter_date_window(fetched, args.start, args.end)
            inserted = upsert(filtered)
            total_candidates += len(filtered)
            total_inserted += inserted
            print(f"  [{i}/{len(symbols)}] {sym}: fetched={len(fetched)} window={len(filtered)} inserted={inserted}")
            if len(fetched) > 0 and len(filtered) == 0:
                print(f"    note: fetched headline dates are in {_date_span(fetched)}, outside requested window")
        except Exception as e:
            failed.append(sym)
            print(f"  [{i}/{len(symbols)}] {sym}: FAILED - {e}")

    print(f"\nDone. inserted={total_inserted}, candidates={total_candidates}")
    if failed:
        print(f"Failed ({len(failed)}): {', '.join(failed)}")


if __name__ == "__main__":
    main()
