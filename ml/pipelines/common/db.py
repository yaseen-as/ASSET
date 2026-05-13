"""PostgreSQL access helpers shared across all training pipelines."""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Iterator

import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

load_dotenv()


def _dsn() -> str:
    return (
        f"postgresql+psycopg2://{os.environ['DB_USER']}:{os.environ['DB_PASSWORD']}"
        f"@{os.environ['DB_HOST']}:{os.environ.get('DB_PORT', '5432')}"
        f"/{os.environ['DB_NAME']}"
    )


def engine() -> Engine:
    return create_engine(_dsn(), pool_pre_ping=True, pool_size=4)


@contextmanager
def conn() -> Iterator:
    eng = engine()
    try:
        with eng.connect() as c:
            yield c
    finally:
        eng.dispose()


def read_sql(query: str, params: dict | None = None) -> pd.DataFrame:
    with conn() as c:
        return pd.read_sql(query, c, params=params)
