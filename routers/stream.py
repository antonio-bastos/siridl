"""FastAPI router for live mobile dashcam streaming detection with ByteTrack deduplication."""

from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Optional

import cv2
import numpy as np
from fastapi import APIRouter, Body, File, Form, HTTPException, UploadFile

from routers.citizen import (
    _blur_privacy_regions,
    _get_predictor,
    _persist_anomaly,
    _store_evidence_image_r2,
)
from services.spatial_enrichment import enrich_anomaly_location
from spatial_vision import (
    HomographyAreaEstimator,
    TrackDeduplicator,
    apply_spatial_priority_boost,
    check_image_quality_gate,
    compute_roi_sharpness,
    severity_from_area_cm2,
    snap_to_road_network,
)

router = APIRouter(prefix="/api/v1/stream", tags=["stream"])

STREAM_CONFIDENCE_THRESHOLD = 0.35
PERSIST_CONFIDENCE_THRESHOLD = 0.45
TRACK_IDLE_EXPIRY_SECONDS = 2.0

_STREAM_DEDUPLICATORS: dict[str, TrackDeduplicator] = {}
_STREAM_LOCK = Lock()


def _get_device_deduplicator(device_id: str) -> TrackDeduplicator:
    with _STREAM_LOCK:
        dedup = _STREAM_DEDUPLICATORS.get(device_id)
        if dedup is None:
            dedup = TrackDeduplicator()
            _STREAM_DEDUPLICATORS[device_id] = dedup
        return dedup


def _persist_track_cluster(device_id: str, cluster: dict[str, Any]) -> dict[str, Any]:
    tid = int(cluster["track_id"])
    sanitized = _blur_privacy_regions(cluster["frame"])
    filename = (
        f"stream_{device_id}_track_{tid}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_"
        f"{uuid.uuid4().hex[:6]}.jpg"
    )
    stored_img = _store_evidence_image_r2(sanitized, filename, quality=85)

    base_severity = severity_from_area_cm2(
        float(cluster["area_cm2"]),
        float(cluster["coverage_pct"]),
    )
    return _persist_anomaly(
        anomaly_type="Buraco no Pavimento",
        confidence=float(cluster["confidence"]),
        coverage_pct=float(cluster["coverage_pct"]),
        severity=base_severity,
        lat=float(cluster["lat"]),
        lng=float(cluster["lng"]),
        image_rel_path=str(stored_img["image_url"]),
        bbox=cluster["bbox"],
        description=(
            f"Captura ao vivo ({device_id} • Track #{tid} • "
            f"{cluster['frames_seen']} fotogramas analisados)."
        ),
        source="fleet_live_capture",
        estimated_area_cm2=float(cluster["area_cm2"]),
        sharpness_score=float(cluster["sharpness"]),
        frames_tracked=int(cluster["frames_seen"]),
        asset_meta=stored_img.get("asset_meta"),
    )


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
    frame_area = max(1, height * width)

    lat = float(meta.get("latitude", 37.1364))
    lng = float(meta.get("longitude", -8.0205))
    device_id = str(meta.get("device_id", "s22u-fleet-01"))

    quality_gate = check_image_quality_gate(frame_bgr)
    if not quality_gate["accepted"]:
        return {
            "status": "quality_rejected",
            "reason": quality_gate["reason"],
            "message": quality_gate["message_pt"],
            "quality_gate": quality_gate,
            "timestamp": meta.get("timestamp") or datetime.now(timezone.utc).isoformat(),
            "frame_width": width,
            "frame_height": height,
            "detections": [],
            "persisted_count": 0,
            "newly_logged_tracks": [],
        }

    predictor = _get_predictor()
    results = predictor.model.track(
        source=frame_bgr,
        persist=True,
        tracker="bytetrack.yaml",
        conf=STREAM_CONFIDENCE_THRESHOLD,
        iou=0.70,
        imgsz=1280,
        verbose=False,
    )

    deduplicator = _get_device_deduplicator(device_id)
    now_s = time.monotonic()

    road_match = snap_to_road_network(lat, lng, cur=None)
    snapped_lat = float(road_match["lat"])
    snapped_lng = float(road_match["lng"])
    enrichment = enrich_anomaly_location(None, snapped_lat, snapped_lng)

    priority_check = apply_spatial_priority_boost("Baixa", snapped_lat, snapped_lng, cur=None)
    nearby_poi = priority_check["nearby_poi"]

    filtered: list[dict[str, Any]] = []
    if results and results[0].boxes is not None and len(results[0].boxes) > 0:
        boxes = results[0].boxes
        xyxy_list = boxes.xyxy.cpu().tolist()
        conf_list = boxes.conf.cpu().tolist()
        id_list = (
            boxes.id.int().cpu().tolist()
            if boxes.id is not None
            else list(range(len(xyxy_list)))
        )

        for tid, coords, conf_val in zip(id_list, xyxy_list, conf_list):
            conf = float(conf_val)
            if conf < STREAM_CONFIDENCE_THRESHOLD:
                continue

            x1, y1, x2, y2 = [float(v) for v in coords]
            bbox = {"x1": x1, "y1": y1, "x2": x2, "y2": y2}
            area_pct = ((x2 - x1) * (y2 - y1) / frame_area) * 100.0
            area_cm2 = HomographyAreaEstimator.estimate_bbox_area_cm2(
                bbox, width, height, area_pct
            )
            sharpness = compute_roi_sharpness(frame_bgr, bbox)
            base_severity = severity_from_area_cm2(area_cm2, area_pct)
            boost_info = apply_spatial_priority_boost(
                base_severity, snapped_lat, snapped_lng, cur=None
            )

            if conf >= PERSIST_CONFIDENCE_THRESHOLD:
                deduplicator.update_track(
                    int(tid),
                    frame_bgr=frame_bgr,
                    bbox=bbox,
                    confidence=conf,
                    area_pct=area_pct,
                    area_cm2=area_cm2,
                    lat=snapped_lat,
                    lng=snapped_lng,
                    timestamp_s=now_s,
                )

            filtered.append(
                {
                    "id": f"trk-{int(tid)}",
                    "track_id": int(tid),
                    "label": "Buraco no Pavimento",
                    "confidence": round(conf, 4),
                    "base_severity": base_severity,
                    "severity": boost_info["severity"],
                    "proximity_boost": boost_info["proximity_boost"],
                    "nearby_poi": boost_info["nearby_poi"],
                    "area_pct": round(area_pct, 3),
                    "estimated_area_cm2": area_cm2,
                    "sharpness_score": sharpness,
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
            )

    completed_clusters = deduplicator.pop_completed_tracks(
        now_s,
        max_idle_s=TRACK_IDLE_EXPIRY_SECONDS,
        min_frames=1,
    )
    newly_logged_tracks: list[dict[str, Any]] = []
    for cluster in completed_clusters:
        saved = _persist_track_cluster(device_id, cluster)
        newly_logged_tracks.append(
            {
                "track_id": int(cluster["track_id"]),
                "anomaly_id": saved["anomaly_id"],
                "frames_tracked": int(cluster["frames_seen"]),
                "estimated_area_cm2": float(cluster["area_cm2"]),
                "sharpness_score": float(cluster["sharpness"]),
                "severity": saved.get("severity"),
                "proximity_boost": bool(saved.get("proximity_boost", False)),
            }
        )

    return {
        "status": "ok",
        "timestamp": meta.get("timestamp") or datetime.now(timezone.utc).isoformat(),
        "frame_width": width,
        "frame_height": height,
        "detections": filtered,
        "persisted_count": len(newly_logged_tracks),
        "newly_logged_tracks": newly_logged_tracks,
        "nearby_poi": nearby_poi,
        "map_matched": road_match,
        "spatial_enrichment": enrichment,
    }


@router.post("/flush")
async def flush_stream_tracks(
    payload: Optional[dict[str, Any]] = Body(default=None),
) -> dict[str, Any]:
    device_id = str((payload or {}).get("device_id", "s22u-fleet-01"))
    deduplicator = _get_device_deduplicator(device_id)
    remaining = deduplicator.flush_all(min_frames=1)

    flushed_tracks: list[dict[str, Any]] = []
    for cluster in remaining:
        saved = _persist_track_cluster(device_id, cluster)
        flushed_tracks.append(
            {
                "track_id": int(cluster["track_id"]),
                "anomaly_id": saved["anomaly_id"],
                "frames_tracked": int(cluster["frames_seen"]),
                "estimated_area_cm2": float(cluster["area_cm2"]),
                "sharpness_score": float(cluster["sharpness"]),
                "severity": saved.get("severity"),
                "proximity_boost": bool(saved.get("proximity_boost", False)),
            }
        )

    return {
        "status": "ok",
        "device_id": device_id,
        "flushed_count": len(flushed_tracks),
        "flushed_tracks": flushed_tracks,
    }
