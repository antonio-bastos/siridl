"""FastAPI router for live mobile dashcam streaming detection."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

import cv2
import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from routers.citizen import (
    UPLOAD_ROOT,
    _blur_privacy_regions,
    _get_predictor,
    _persist_anomaly,
    _severity_from_coverage,
)

router = APIRouter(prefix="/api/v1/stream", tags=["stream"])

STREAM_CONFIDENCE_THRESHOLD = 0.35
PERSIST_CONFIDENCE_THRESHOLD = 0.45


@router.post("/detect")
async def detect_stream_frame(
    frame: UploadFile = File(...),
    telemetry: str = Form(...),
) -> dict[str, Any]:
    try:
        meta = json.loads(telemetry)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=422, detail="Telemetria JSON inválida.") from exc

    raw_bytes = await frame.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Fotograma vazio.")

    np_buf = np.frombuffer(raw_bytes, dtype=np.uint8)
    frame_bgr = cv2.imdecode(np_buf, cv2.IMREAD_COLOR)
    if frame_bgr is None:
        raise HTTPException(status_code=400, detail="Não foi possível descodificar o fotograma.")

    height, width = frame_bgr.shape[:2]
    predictor = _get_predictor()
    records, _, _ = predictor.predict(frame_bgr, save=False)
    raw_detections = records[0]["detections"] if records else []

    filtered: list[dict[str, Any]] = []
    persisted_count = 0

    lat = float(meta.get("latitude", 37.1364))
    lng = float(meta.get("longitude", -8.0205))
    device_id = str(meta.get("device_id", "s22u-fleet-01"))
    speed_kmh = float(meta.get("speed_kmh", 0.0))

    for det in raw_detections:
        conf = float(det["confidence"])
        if conf < STREAM_CONFIDENCE_THRESHOLD:
            continue

        x1 = float(det["x1"])
        y1 = float(det["y1"])
        x2 = float(det["x2"])
        y2 = float(det["y2"])
        area_pct = float(det.get("area_pct", 0.0))
        severity = _severity_from_coverage(area_pct)

        item = {
            "id": uuid.uuid4().hex[:8],
            "label": "Buraco no Pavimento",
            "confidence": round(conf, 4),
            "severity": severity,
            "area_pct": round(area_pct, 3),
            "bbox": {
                "x1": x1,
                "y1": y1,
                "x2": x2,
                "y2": y2,
                "norm_x1": round(x1 / max(1, width), 5),
                "norm_y1": round(y1 / max(1, height), 5),
                "norm_x2": round(x2 / max(1, width), 5),
                "norm_y2": round(y2 / max(1, height), 5),
            },
        }
        filtered.append(item)

        if conf >= PERSIST_CONFIDENCE_THRESHOLD and persisted_count == 0:
            sanitized = _blur_privacy_regions(frame_bgr)
            filename = (
                f"stream_{device_id}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_"
                f"{uuid.uuid4().hex[:6]}.jpg"
            )
            cv2.imwrite(str(UPLOAD_ROOT / filename), sanitized, [cv2.IMWRITE_JPEG_QUALITY, 85])
            _persist_anomaly(
                anomaly_type="Buraco no Pavimento",
                confidence=conf,
                coverage_pct=area_pct,
                severity=severity,
                lat=lat,
                lng=lng,
                image_rel_path=f"/uploads/citizen/{filename}",
                bbox={"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                description=f"Captura ao vivo ({device_id} • {speed_kmh:.1f} km/h).",
                source="fleet_live_capture",
            )
            persisted_count += 1

    return {
        "status": "ok",
        "timestamp": meta.get("timestamp") or datetime.now(timezone.utc).isoformat(),
        "frame_width": width,
        "frame_height": height,
        "detections": filtered,
        "persisted_count": persisted_count,
    }
