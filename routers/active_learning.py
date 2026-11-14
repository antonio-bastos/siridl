"""FastAPI router for Active Learning & Hard-Negative Mining (Cloudflare R2 + Supabase)."""

from __future__ import annotations

import base64
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Optional

import cv2
import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel, Field

from services.r2_storage import PROJECT_ROOT, get_r2_config, upload_object
from services.supabase_db import log_active_learning_sample

router = APIRouter(prefix="/api/v1/active-learning", tags=["active-learning"])

FALSE_POSITIVE_LABELS_PT: dict[str, str] = {
    "shadow": "Sombra",
    "wet_patch": "Mancha Húmida",
    "tar_line": "Linha de Alcatrão",
}


class FalsePositiveRequest(BaseModel):
    detection_id: str = Field(..., min_length=1, max_length=128)
    reason: Literal["shadow", "wet_patch", "tar_line"]
    image_url: Optional[str] = None
    street: Optional[str] = None
    parish: Optional[str] = None
    confidence: Optional[float] = None
    bbox: Optional[dict[str, Any]] = None
    frame_base64: Optional[str] = None


def _resolve_frame_bytes(payload: FalsePositiveRequest) -> tuple[bytes, str]:
    """Resolve JPEG bytes from base64, local public image, or fallback metadata card."""
    if payload.frame_base64:
        b64_data = payload.frame_base64.split(",", 1)[-1]
        try:
            decoded = base64.b64decode(b64_data, validate=True)
            if decoded:
                return decoded, "base64_frame"
        except Exception:
            pass

    if payload.image_url:
        rel = payload.image_url.lstrip("/")
        candidates = [
            PROJECT_ROOT / "dashboard" / "public" / rel,
            PROJECT_ROOT / rel,
        ]
        for path in candidates:
            if path.is_file():
                return path.read_bytes(), f"local_file:{path.name}"

    canvas = np.full((360, 640, 3), 28, dtype=np.uint8)
    cv2.putText(
        canvas,
        f"SIRI-DL Hard Negative: {payload.detection_id}",
        (24, 150),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.75,
        (220, 220, 220),
        2,
        cv2.LINE_AA,
    )
    cv2.putText(
        canvas,
        f"Reason: {payload.reason} | {payload.street or 'Loule'}",
        (24, 195),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.6,
        (160, 190, 210),
        1,
        cv2.LINE_AA,
    )
    ok, encoded = cv2.imencode(".jpg", canvas, [cv2.IMWRITE_JPEG_QUALITY, 90])
    return (encoded.tobytes() if ok else b""), "synthetic_metadata_card"


@router.post("/false-positive")
async def report_false_positive(payload: FalsePositiveRequest) -> dict[str, Any]:
    """Save a hard-negative sample to Cloudflare R2 retrain_dataset/ and log it in Supabase."""
    cfg = get_r2_config()
    ts = datetime.now(timezone.utc)
    sample_id = f"hn_{ts.strftime('%Y%m%d_%H%M%S')}_{payload.detection_id}_{uuid.uuid4().hex[:6]}"
    prefix = cfg["prefix"]

    image_bytes, image_source = _resolve_frame_bytes(payload)
    empty_yolo_label = b""
    metadata = {
        "sample_id": sample_id,
        "detection_id": payload.detection_id,
        "false_positive_reason": payload.reason,
        "false_positive_label_pt": FALSE_POSITIVE_LABELS_PT[payload.reason],
        "street": payload.street,
        "parish": payload.parish,
        "confidence": payload.confidence,
        "bbox": payload.bbox,
        "image_source": image_source,
        "created_at": ts.isoformat(),
        "yolo_hard_negative": True,
    }
    metadata_bytes = json.dumps(metadata, ensure_ascii=False, indent=2).encode("utf-8")

    files_to_upload = [
        (f"{prefix}/images/{sample_id}.jpg", image_bytes, "image/jpeg"),
        (f"{prefix}/labels/{sample_id}.txt", empty_yolo_label, "text/plain"),
        (f"{prefix}/metadata/{sample_id}.json", metadata_bytes, "application/json"),
    ]

    uploaded_keys: list[str] = []
    errors: list[str] = []
    image_asset_meta: Optional[dict[str, Any]] = None

    for key, content, ctype in files_to_upload:
        res = upload_object(object_key=key, body=content, content_type=ctype, config=cfg)
        if res.get("ok"):
            uploaded_keys.append(key)
            if ctype == "image/jpeg":
                image_asset_meta = res
        elif res.get("error"):
            errors.append(f"{key}: {res['error']}")

    supabase_record_id = log_active_learning_sample(
        sample_id=sample_id,
        detection_id=payload.detection_id,
        reason=payload.reason,
        reason_label_pt=FALSE_POSITIVE_LABELS_PT[payload.reason],
        street_name=payload.street,
        parish=payload.parish,
        confidence=payload.confidence,
        bbox=payload.bbox,
        bucket=cfg["bucket"],
        r2_keys=uploaded_keys,
        image_asset_meta=image_asset_meta,
    )

    return {
        "status": "ok",
        "sample_id": sample_id,
        "supabase_record_id": supabase_record_id,
        "detection_id": payload.detection_id,
        "reason": payload.reason,
        "reason_label_pt": FALSE_POSITIVE_LABELS_PT[payload.reason],
        "r2_bucket": cfg["bucket"],
        "r2_uploaded": len(uploaded_keys) == len(files_to_upload),
        "r2_keys": uploaded_keys,
        "r2_error": "; ".join(errors) if errors else None,
    }
