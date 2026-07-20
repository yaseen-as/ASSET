"""Backfill insights.fundamentals_daily from Yahoo Finance.

Used to seed insights_db when a production fundamentals feed is not wired
yet. Pulls quarterly statement data via yfinance, derives the ratios used
by the fundamental model, and upserts into insights.fundamentals_daily.

Symbols are passed without Yahoo suffix — `--exchange NSE` appends `.NS`
and `--exchange BSE` appends `.BO` when querying Yahoo.

Usage:
    python -m pipelines.fundamental.ingest \
      --symbols RELIANCE,HDFCBANK,TCS \
      --start 2020-01-01 --end 2026-05-01

    # Or read symbols from a file (one per line):
    python -m pipelines.fundamental.ingest --symbols-file nifty200.txt \
      --start 2020-01-01 --end 2026-05-01
"""

from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf
from sqlalchemy import text

from ..common.db import conn, engine

YAHOO_SUFFIX = {"NSE": ".NS", "BSE": ".BO"}


def _to_yahoo(symbol: str, exchange: str) -> str:
    return f"{symbol}{YAHOO_SUFFIX[exchange]}"


def _read_symbols(args: argparse.Namespace) -> list[str]:
    if args.symbols_file:
        path = Path(args.symbols_file)
        return [s.strip().upper() for s in path.read_text().splitlines() if s.strip() and not s.startswith("#")]
    if args.symbols:
        return [s.strip().upper() for s in args.symbols.split(",") if s.strip()]
    raise SystemExit("Provide --symbols CSV or --symbols-file path.")


def _pick_numeric(row: pd.Series, names: list[str]) -> float:
    for name in names:
        if name in row.index and pd.notna(row[name]):
            try:
                return float(row[name])
            except (TypeError, ValueError):
                continue
    return np.nan


def _safe_div(n: float, d: float) -> float:
    if pd.isna(n) or pd.isna(d) or d == 0:
        return np.nan
    return float(n) / float(d)


def _to_naive_datetime(s: pd.Series) -> pd.Series:
    out = pd.to_datetime(s, errors="coerce")
    # yfinance often returns tz-aware timestamps; normalize so merge keys match.
    if getattr(out.dt, "tz", None) is not None:
        out = out.dt.tz_convert("UTC").dt.tz_localize(None)
    return out


def _close_as_of(price_df: pd.DataFrame, as_of_dates: pd.Series) -> pd.Series:
    if price_df.empty:
        return pd.Series([np.nan] * len(as_of_dates), index=as_of_dates.index)

    prices = price_df.reset_index().rename(columns={"Date": "date", "Close": "close"})
    if "date" not in prices.columns or "close" not in prices.columns:
        return pd.Series([np.nan] * len(as_of_dates), index=as_of_dates.index)

    prices = prices[["date", "close"]].dropna()
    prices["date"] = _to_naive_datetime(prices["date"])
    prices = prices.dropna(subset=["date"]).sort_values("date")
    if prices.empty:
        return pd.Series([np.nan] * len(as_of_dates), index=as_of_dates.index)

    target = pd.DataFrame({"date": _to_naive_datetime(as_of_dates)})
    target["_row"] = np.arange(len(target))
    target = target.sort_values("date")
    merged = pd.merge_asof(target, prices, on="date", direction="backward")
    merged = merged.sort_values("_row")
    return merged["close"].reset_index(drop=True)


def _statement_df(ticker: yf.Ticker) -> pd.DataFrame:
    income = ticker.quarterly_income_stmt
    balance = ticker.quarterly_balance_sheet

    if income is None or income.empty:
        return pd.DataFrame()

    income_t = income.T.copy()
    income_t.index = pd.to_datetime(income_t.index)

    if balance is not None and not balance.empty:
        balance_t = balance.T.copy()
        balance_t.index = pd.to_datetime(balance_t.index)
        stmt = income_t.join(balance_t, how="outer", rsuffix="_bs")
    else:
        stmt = income_t

    stmt = stmt.sort_index().reset_index().rename(columns={"index": "as_of_date"})
    return stmt


def fetch_one(symbol: str, exchange: str, start: date, end: date) -> pd.DataFrame:
    ticker_code = _to_yahoo(symbol, exchange)
    t = yf.Ticker(ticker_code)

    stmt = _statement_df(t)
    if stmt.empty:
        return pd.DataFrame()

    sector = ""
    try:
        info = t.info or {}
        sector = str(info.get("sector") or "")
    except Exception:
        sector = ""

    prices = t.history(start=(pd.Timestamp(start) - pd.Timedelta(days=370)).date().isoformat(), end=end.isoformat(), auto_adjust=False)
    if isinstance(prices.columns, pd.MultiIndex):
        prices.columns = prices.columns.get_level_values(0)

    out = pd.DataFrame()
    out["as_of_date"] = pd.to_datetime(stmt["as_of_date"]).dt.date
    out["symbol"] = symbol
    out["exchange"] = exchange

    out["eps"] = stmt.apply(lambda r: _pick_numeric(r, ["Diluted EPS", "Basic EPS", "EPS"]), axis=1)
    net_income = stmt.apply(lambda r: _pick_numeric(r, ["Net Income", "Net Income Common Stockholders"]), axis=1)
    equity = stmt.apply(lambda r: _pick_numeric(r, ["Stockholders Equity", "Total Equity Gross Minority Interest", "Total Equity"]), axis=1)
    total_debt = stmt.apply(lambda r: _pick_numeric(r, ["Total Debt", "Long Term Debt", "Current Debt"]), axis=1)
    revenue = stmt.apply(lambda r: _pick_numeric(r, ["Total Revenue", "Revenue"]), axis=1)

    close_as_of = _close_as_of(prices, pd.to_datetime(stmt["as_of_date"]))
    out["pe_ratio"] = [
        _safe_div(px, eps) for px, eps in zip(close_as_of, out["eps"])
    ]
    out["roe"] = [_safe_div(ni, eq) for ni, eq in zip(net_income, equity)]
    out["debt_to_equity"] = [_safe_div(td, eq) for td, eq in zip(total_debt, equity)]

    rev_series = pd.Series(revenue, dtype="float64")
    eps_series = pd.Series(out["eps"], dtype="float64")
    out["revenue_growth_yoy"] = (rev_series / rev_series.shift(4) - 1.0).replace([np.inf, -np.inf], np.nan)
    out["eps_growth_yoy"] = (eps_series / eps_series.shift(4) - 1.0).replace([np.inf, -np.inf], np.nan)
    out["sector"] = sector

    out = out[(out["as_of_date"] >= start) & (out["as_of_date"] <= end)]
    out = out.sort_values("as_of_date")
    return out[
        [
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
    ]


def upsert(df: pd.DataFrame) -> int:
    """Bulk upsert into insights.fundamentals_daily. Returns rows written."""
    if df.empty:
        return 0

    records = df.to_dict(orient="records")
    stmt = text(
        """
        INSERT INTO insights.fundamentals_daily
          (symbol, exchange, as_of_date, pe_ratio, eps, eps_growth_yoy, roe,
           debt_to_equity, revenue_growth_yoy, sector)
        VALUES
          (:symbol, :exchange, :as_of_date, :pe_ratio, :eps, :eps_growth_yoy, :roe,
           :debt_to_equity, :revenue_growth_yoy, :sector)
        ON CONFLICT (symbol, exchange, as_of_date) DO UPDATE SET
          pe_ratio = EXCLUDED.pe_ratio,
          eps = EXCLUDED.eps,
          eps_growth_yoy = EXCLUDED.eps_growth_yoy,
          roe = EXCLUDED.roe,
          debt_to_equity = EXCLUDED.debt_to_equity,
          revenue_growth_yoy = EXCLUDED.revenue_growth_yoy,
          sector = EXCLUDED.sector,
          updated_at = NOW()
        """
    )

    with conn() as c:
        with c.begin():
            c.execute(stmt, records)
    return len(records)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--symbols", help="Comma-separated tickers (no exchange suffix), e.g. RELIANCE,TCS")
    parser.add_argument("--symbols-file", help="File with one ticker per line.")
    parser.add_argument("--exchange", default="NSE", choices=["NSE", "BSE"])
    parser.add_argument("--start", type=date.fromisoformat, required=True)
    parser.add_argument("--end", type=date.fromisoformat, required=True)
    args = parser.parse_args()

    symbols = _read_symbols(args)
    print(f"Ingesting fundamentals for {len(symbols)} {args.exchange} symbols from {args.start} to {args.end}")

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