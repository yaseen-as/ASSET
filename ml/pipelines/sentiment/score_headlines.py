"""VADER sentiment scoring for stock news headlines.

Reads headlines from `insights.news_headlines` (table populated by an
optional ingestion job) and writes per-(symbol, date) compound scores
into `insights.sentiment_scores`.

VADER is rule-based (no training), so there is no ONNX export. A
synthetic `model_registry` row is still inserted so downstream services
(scorer, backtest, meta) can reference it by id like any other model.
FinBERT is the planned upgrade — drop-in replacement of the score()
function, no schema change.
"""

from __future__ import annotations

import argparse
import json
import uuid
from datetime import date, timedelta

import pandas as pd
from sqlalchemy import text
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from ..common.db import conn, read_sql


VADER = SentimentIntensityAnalyzer()


def ensure_vader_model_row() -> str:
    """Idempotently insert a stub model_registry row for VADER. Returns model_id."""
    with conn() as c:
        existing = c.execute(
            text("SELECT id FROM insights.model_registry WHERE name = 'sentiment' AND version = 'vader-1.0' LIMIT 1")
        ).fetchone()
        if existing:
            return str(existing[0])
        model_id = str(uuid.uuid4())
        with c.begin():
            c.execute(
                text(
                    """
                    INSERT INTO insights.model_registry
                      (id, name, version, framework, artifact_uri, feature_set,
                       training_data, metrics, status, rollout_percent, created_by, promoted_at)
                    VALUES
                      (:id, 'sentiment', 'vader-1.0', 'rules', 'rules://vader', 'sentiment_v1',
                       CAST(:td AS jsonb), CAST(:m AS jsonb), 'production', 100, 'vader-init', NOW())
                    """
                ),
                {"id": model_id, "td": json.dumps({"source": "vader-rules"}), "m": json.dumps({})},
            )
        return model_id


def fetch_headlines(start: date, end: date) -> pd.DataFrame:
    return read_sql(
        """
        SELECT symbol, exchange, published_at::date AS as_of_date, headline
        FROM insights.news_headlines
        WHERE published_at::date BETWEEN %(start)s AND %(end)s
        """,
        params={"start": start, "end": end},
    )


def aggregate_sentiment(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df.assign(score=[])
    df = df.copy()
    df["compound"] = df["headline"].map(lambda h: VADER.polarity_scores(h)["compound"])
    # Map compound (-1..1) into a 0..1 score for uniformity with other models.
    df["score"] = (df["compound"] + 1) / 2
    grouped = (
        df.groupby(["symbol", "exchange", "as_of_date"], as_index=False)["score"].mean()
    )
    return grouped


def write_scores(model_id: str, rows: pd.DataFrame) -> int:
    if rows.empty:
        return 0
    with conn() as c:
        with c.begin():
            for _, r in rows.iterrows():
                c.execute(
                    text(
                        """
                        INSERT INTO insights.sentiment_scores
                          (symbol, exchange, as_of_date, model_id, score, features_ref)
                        VALUES
                          (:symbol, :exchange, :as_of_date, :model_id, :score, CAST(:fr AS jsonb))
                        ON CONFLICT (symbol, exchange, as_of_date, model_id)
                        DO UPDATE SET score = EXCLUDED.score, features_ref = EXCLUDED.features_ref
                        """
                    ),
                    {
                        "symbol": r["symbol"],
                        "exchange": r["exchange"],
                        "as_of_date": r["as_of_date"],
                        "model_id": model_id,
                        "score": float(r["score"]),
                        "fr": json.dumps({"source": "vader"}),
                    },
                )
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", type=date.fromisoformat, default=None)
    parser.add_argument("--end", type=date.fromisoformat, default=None)
    args = parser.parse_args()

    end = args.end or date.today()
    start = args.start or (end - timedelta(days=1))

    model_id = ensure_vader_model_row()
    df = fetch_headlines(start, end)
    if df.empty:
        print(f"No headlines for {start} .. {end}; nothing to score.")
        return
    rows = aggregate_sentiment(df)
    n = write_scores(model_id, rows)
    print(f"Wrote {n} sentiment_scores rows (model_id={model_id})")


if __name__ == "__main__":
    main()
