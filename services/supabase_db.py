"""Centralized Supabase PostgreSQL database client and repositories."""

from __future__ import annotations

import json
import os
from contextlib import contextmanager
from typing import Any, Iterator, Optional

from services.r2_storage import load_env_local_if_needed

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover
    psycopg = None
    dict_row = None


def get_database_url() -> Optional[str]:
    load_env_local_if_needed()
    url = os.getenv("DATABASE_URL", "").strip()
    return url or None


@contextmanager
def db_connection() -> Iterator[Any]:
    """Yield a psycopg connection to Supabase PostgreSQL (with SSL required)."""
    if psycopg is None:
        raise RuntimeError("psycopg não está instalado no ambiente Python.")
    database_url = get_database_url()
    if not database_url:
        raise RuntimeError("DATABASE_URL não configurada.")

    conn = psycopg.connect(database_url, row_factory=dict_row, sslmode="require")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def register_media_asset(
    cur: Any,
    *,
    bucket: str,
    object_key: str,
    public_url: str,
    mime_type: str,
    file_size: int,
    sha256: Optional[str],
    entity_type: str,
    entity_id: Optional[str] = None,
) -> str:
    """Idempotently register an R2 media asset in public.media_assets and return its UUID."""
    cur.execute(
        """
        INSERT INTO public.media_assets (
            storage_provider, bucket, object_key, public_url,
            mime_type, file_size, sha256, entity_type, entity_id
        )
        VALUES ('cloudflare_r2', %(bucket)s, %(object_key)s, %(public_url)s,
                %(mime_type)s, %(file_size)s, %(sha256)s, %(entity_type)s, %(entity_id)s)
        ON CONFLICT (object_key) DO UPDATE SET
            public_url = EXCLUDED.public_url,
            mime_type = EXCLUDED.mime_type,
            file_size = EXCLUDED.file_size,
            sha256 = COALESCE(EXCLUDED.sha256, public.media_assets.sha256),
            entity_id = COALESCE(EXCLUDED.entity_id, public.media_assets.entity_id)
        RETURNING id::text;
        """,
        {
            "bucket": bucket,
            "object_key": object_key,
            "public_url": public_url,
            "mime_type": mime_type,
            "file_size": file_size,
            "sha256": sha256,
            "entity_type": entity_type,
            "entity_id": entity_id,
        },
    )
    row = cur.fetchone()
    return str(row["id"])


def log_active_learning_sample(
    *,
    sample_id: str,
    detection_id: str,
    reason: str,
    reason_label_pt: str,
    street_name: Optional[str],
    parish: Optional[str],
    confidence: Optional[float],
    bbox: Optional[dict[str, Any]],
    bucket: str,
    r2_keys: list[str],
    image_asset_meta: Optional[dict[str, Any]] = None,
) -> Optional[str]:
    """Persist active learning hard-negative metadata & asset link in Supabase."""
    database_url = get_database_url()
    if not database_url or psycopg is None:
        return None

    with db_connection() as conn:
        with conn.cursor() as cur:
            asset_id: Optional[str] = None
            if image_asset_meta and image_asset_meta.get("ok"):
                asset_id = register_media_asset(
                    cur,
                    bucket=bucket,
                    object_key=str(image_asset_meta["object_key"]),
                    public_url=str(image_asset_meta["public_url"]),
                    mime_type=str(image_asset_meta["mime_type"]),
                    file_size=int(image_asset_meta["file_size"]),
                    sha256=image_asset_meta.get("sha256"),
                    entity_type="active_learning",
                    entity_id=sample_id,
                )

            cur.execute(
                """
                INSERT INTO public.active_learning_samples (
                    sample_id, detection_id, reason, reason_label_pt,
                    street_name, parish, confidence, bbox,
                    asset_id, r2_bucket, r2_keys
                )
                VALUES (
                    %(sample_id)s, %(detection_id)s, %(reason)s, %(reason_label_pt)s,
                    %(street_name)s, %(parish)s, %(confidence)s, %(bbox)s::jsonb,
                    %(asset_id)s::uuid, %(r2_bucket)s, %(r2_keys)s::jsonb
                )
                ON CONFLICT (sample_id) DO NOTHING
                RETURNING id::text;
                """,
                {
                    "sample_id": sample_id,
                    "detection_id": detection_id,
                    "reason": reason,
                    "reason_label_pt": reason_label_pt,
                    "street_name": street_name,
                    "parish": parish,
                    "confidence": confidence,
                    "bbox": json.dumps(bbox) if bbox else None,
                    "asset_id": asset_id,
                    "r2_bucket": bucket,
                    "r2_keys": json.dumps(r2_keys),
                },
            )
            row = cur.fetchone()
            return str(row["id"]) if row else None
