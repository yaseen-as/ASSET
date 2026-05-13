"""Walk-forward splitting for time-series training.

The split is purely date-based; no row-shuffling. Default windows match
the plan: train [t-2y, t-3m], val [t-3m, t-1m], test [t-1m, t].
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

import pandas as pd


@dataclass(frozen=True)
class Split:
    train_start: date
    train_end: date     # inclusive
    val_start: date
    val_end: date       # inclusive
    test_start: date
    test_end: date      # inclusive


def make_split(
    reference: date,
    train_years: float = 2.0,
    val_months: float = 2.0,
    test_months: float = 1.0,
) -> Split:
    """Build a single train/val/test split anchored at `reference` (the test end)."""
    test_end = reference
    test_start = reference - timedelta(days=int(test_months * 30))
    val_end = test_start - timedelta(days=1)
    val_start = val_end - timedelta(days=int(val_months * 30))
    train_end = val_start - timedelta(days=1)
    train_start = train_end - timedelta(days=int(train_years * 365))
    return Split(train_start, train_end, val_start, val_end, test_start, test_end)


def apply_split(df: pd.DataFrame, split: Split, date_col: str = "date") -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    d = pd.to_datetime(df[date_col]).dt.date
    train = df[(d >= split.train_start) & (d <= split.train_end)]
    val = df[(d >= split.val_start) & (d <= split.val_end)]
    test = df[(d >= split.test_start) & (d <= split.test_end)]
    return train, val, test
