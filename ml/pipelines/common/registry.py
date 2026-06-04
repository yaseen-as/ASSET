"""Uploads a trained ONNX model + metadata into insights.model_registry.

Writes the model row as `status='draft'`. Promotion to canary/production
is a separate admin step (POST /v1/models/:id/promote on insights-service,
served from src/recommendations/api/models.controller.ts).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import uuid
from pathlib import Path

from sqlalchemy import text

from .db import conn


def upload(
    name: str,
    version: str,
    framework: str,
    feature_set: str,
    onnx_path: Path,
    meta_path: Path,
    eval_path: Path | None,
    created_by: str = "ml-pipeline",
) -> str:
    onnx_bytes = onnx_path.read_bytes()
    sha = hashlib.sha256(onnx_bytes).hexdigest()
    meta = json.loads(meta_path.read_text())
    metrics = json.loads(eval_path.read_text()) if eval_path and eval_path.exists() else {"val_auc": meta.get("val_auc")}

    model_id = str(uuid.uuid4())
    artifact_uri = f"pg-bytea://{model_id}"

    with conn() as c:
        with c.begin():
            c.execute(
                text(
                    """
                    INSERT INTO insights.model_registry
                      (id, name, version, framework, artifact_uri, feature_set,
                       training_data, metrics, status, rollout_percent, created_by)
                    VALUES
                      (:id, :name, :version, :framework, :artifact_uri, :feature_set,
                       CAST(:training_data AS jsonb), CAST(:metrics AS jsonb), 'draft', 0, :created_by)
                    """
                ),
                {
                    "id": model_id,
                    "name": name,
                    "version": version,
                    "framework": framework,
                    "artifact_uri": artifact_uri,
                    "feature_set": feature_set,
                    "training_data": json.dumps(meta.get("training_data", {})),
                    "metrics": json.dumps(metrics),
                    "created_by": created_by,
                },
            )
            c.execute(
                text(
                    """
                    INSERT INTO insights.model_artifacts
                      (model_id, bytes, size_bytes, sha256)
                    VALUES
                      (:model_id, :bytes, :size_bytes, :sha256)
                    """
                ),
                {
                    "model_id": model_id,
                    "bytes": onnx_bytes,
                    "size_bytes": len(onnx_bytes),
                    "sha256": sha,
                },
            )
    print(f"Registered {name} v{version} as {model_id} ({len(onnx_bytes):,} bytes)")
    return model_id


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", required=True, choices=["technical", "fundamental", "sentiment", "meta"])
    parser.add_argument("--version", required=True)
    parser.add_argument("--framework", default="lightgbm")
    parser.add_argument("--feature-set", required=True)
    parser.add_argument("--onnx", type=Path, required=True)
    parser.add_argument("--meta", type=Path, required=True)
    parser.add_argument("--eval", type=Path, default=None)
    parser.add_argument("--created-by", default="ml-pipeline")
    args = parser.parse_args()

    upload(
        name=args.name,
        version=args.version,
        framework=args.framework,
        feature_set=args.feature_set,
        onnx_path=args.onnx,
        meta_path=args.meta,
        eval_path=args.eval,
        created_by=args.created_by,
    )


if __name__ == "__main__":
    main()
