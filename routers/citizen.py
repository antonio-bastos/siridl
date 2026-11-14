"""FastAPI router for the SIRI-DL Citizen Portal ("Eu Participo")."""

from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
import uuid
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Optional

import cv2
import numpy as np
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile

from predict import PersistentModelManager, PotholePredictor, resolve_model
from services.r2_storage import upload_object
from services.spatial_enrichment import enrich_anomaly_location
from services.supabase_db import get_database_url, register_media_asset
from spatial_vision import (
    HomographyAreaEstimator,
    TrackDeduplicator,
    apply_spatial_priority_boost,
    check_image_quality_gate,
    compute_roi_sharpness,
    severity_from_area_cm2,
    snap_to_road_network,
)

try:  # Optional PostgreSQL/PostGIS driver
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover - optional runtime dependency
    psycopg = None
    dict_row = None

try:  # Optional GPX parser
    import gpxpy
except ImportError:  # pragma: no cover - optional runtime dependency
    gpxpy = None


router = APIRouter(prefix="/api/v1/citizen", tags=["citizen"])

UPLOAD_ROOT = Path(os.getenv("SIRI_CITIZEN_UPLOAD_DIR", "uploads/citizen"))
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
LOCAL_STORE_PATH = UPLOAD_ROOT / "local_anomalies.json"
LOCAL_STORE_LOCK = Lock()

AI_CONFIDENCE_GATE = 0.45
DEDUP_RADIUS_METERS = 3.0
MIN_VIDEO_SPEED_KMH = 3.0
TARGET_SAMPLE_FPS = 6.0

CATEGORY_LABELS_PT: dict[str, str] = {
    "buraco": "Buraco no Pavimento",
    "fissura": "Fissura Longitudinal",
    "tampa": "Tampa de Esgoto Desnivelada",
    "sinalizacao": "Sinalização Danificada",
    "auto": "Buraco no Pavimento",
}

_JOBS: dict[str, dict[str, Any]] = {}
_JOBS_LOCK = Lock()


def _get_predictor() -> PotholePredictor:
    model_path = resolve_model(None)
    predictor, _ = PersistentModelManager.get_predictor(
        model_path=model_path,
        device="0",
        imgsz=1280,
        conf=0.20,
        iou=0.70,
        max_det=300,
        precision="auto",
        batch_size=1,
        tta=False,
        warmup=True,
    )
    return predictor


def _severity_from_coverage(coverage_pct: float) -> str:
    if coverage_pct >= 6.0:
        return "Crítica"
    if coverage_pct >= 1.8:
        return "Média"
    return "Baixa"


def _resolve_anomaly_label(category: Optional[str]) -> str:
    if not category:
        return "Buraco no Pavimento"
    normalized = category.strip().lower()
    return CATEGORY_LABELS_PT.get(normalized, category.strip())


def _load_haar_cascades() -> list[cv2.CascadeClassifier]:
    cascades: list[cv2.CascadeClassifier] = []
    haar_dir = getattr(cv2.data, "haarcascades", "")
    for filename in (
        "haarcascade_frontalface_default.xml",
        "haarcascade_russian_plate_number.xml",
    ):
        cascade_path = Path(haar_dir) / filename
        if cascade_path.exists():
            clf = cv2.CascadeClassifier(str(cascade_path))
            if not clf.empty():
                cascades.append(clf)
    return cascades


_PRIVACY_CASCADES = _load_haar_cascades()


def _blur_privacy_regions(image_bgr: np.ndarray) -> np.ndarray:
    """Apply Gaussian blur to detected faces and license plates for RGPD privacy."""
    if not _PRIVACY_CASCADES or image_bgr.size == 0:
        return image_bgr

    sanitized = image_bgr.copy()
    gray = cv2.cvtColor(sanitized, cv2.COLOR_BGR2GRAY)
    height, width = sanitized.shape[:2]

    for cascade in _PRIVACY_CASCADES:
        regions = cascade.detectMultiScale(
            gray,
            scaleFactor=1.15,
            minNeighbors=4,
            minSize=(24, 24),
        )
        for x, y, w, h in regions:
            x1 = max(0, int(x))
            y1 = max(0, int(y))
            x2 = min(width, int(x + w))
            y2 = min(height, int(y + h))
            roi = sanitized[y1:y2, x1:x2]
            if roi.size > 0:
                ksize = max(15, (min(w, h) // 3) | 1)
                sanitized[y1:y2, x1:x2] = cv2.GaussianBlur(roi, (ksize, ksize), 0)

    return sanitized


def _haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    earth_radius_m = 6_371_000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = (
        math.sin(dphi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    )
    return 2.0 * earth_radius_m * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def _store_evidence_image_r2(
    frame_bgr: np.ndarray,
    filename: str,
    quality: int = 90,
) -> dict[str, Any]:
    """Encode frame as JPEG and upload directly to Cloudflare R2 (no binary stored in Postgres)."""
    ok, encoded = cv2.imencode(".jpg", frame_bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        return {"image_key": None, "image_url": f"/api/media/uploads/citizen/{filename}", "asset_meta": None}
    object_key = f"uploads/citizen/{filename}"
    res = upload_object(
        object_key=object_key,
        body=encoded.tobytes(),
        content_type="image/jpeg",
    )
    if res.get("ok"):
        return {
            "image_key": object_key,
            "image_url": str(res["public_url"]),
            "asset_meta": res,
        }
    # Local fallback only if R2 is unreachable
    cv2.imwrite(str(UPLOAD_ROOT / filename), frame_bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return {
        "image_key": object_key,
        "image_url": f"/uploads/citizen/{filename}",
        "asset_meta": None,
    }


def _persist_anomaly_postgis(
    *,
    anomaly_type: str,
    confidence: float,
    coverage_pct: float,
    severity: str,
    lat: float,
    lng: float,
    image_rel_path: str,
    bbox: dict[str, Any],
    description: Optional[str],
    source: str,
    estimated_area_cm2: float = 0.0,
    sharpness_score: float = 0.0,
    frames_tracked: int = 1,
    asset_meta: Optional[dict[str, Any]] = None,
) -> Optional[dict[str, Any]]:
    database_url = get_database_url()
    if not database_url or psycopg is None:
        return None

    with psycopg.connect(database_url, row_factory=dict_row, sslmode="require") as conn:
        with conn.cursor() as cur:
            # 1. Map-match raw GPS onto nearest OSM road centerline via ST_ClosestPoint.
            road_match = snap_to_road_network(lat, lng, cur=cur)
            final_lat = float(road_match["lat"])
            final_lng = float(road_match["lng"])
            street_name = str(road_match["street_name"])
            parish = str(road_match["parish"])
            road_class = str(road_match["road_class"])
            snap_distance_m = float(road_match["snap_distance_m"])

            # 1a. CAOP 2025 parish tagging (ST_Contains) + IP Rede Rodoviária jurisdiction (ST_DWithin 15m).
            enrichment = enrich_anomaly_location(cur, final_lat, final_lng)
            if enrichment.get("freguesia"):
                parish = str(enrichment["freguesia"])

            # 1b. Apply 100 m spatial buffer priority boost (schools, hospitals, roundabouts, crosswalks).
            priority_info = apply_spatial_priority_boost(
                base_severity=severity,
                lat=final_lat,
                lng=final_lng,
                cur=cur,
            )
            final_severity = priority_info["severity"]
            nearby_poi = priority_info["nearby_poi"]

            # 2. Deduplicate within 3 meters using PostGIS geography distance.
            cur.execute(
                """
                SELECT id, anomaly_code, times_detected, street_name
                FROM road_anomalies
                WHERE ST_DWithin(
                    geom,
                    ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography,
                    %(radius_m)s
                )
                ORDER BY ST_Distance(
                    geom,
                    ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography
                ) ASC
                LIMIT 1;
                """,
                {"lat": final_lat, "lng": final_lng, "radius_m": DEDUP_RADIUS_METERS},
            )
            existing = cur.fetchone()

            asset_id: Optional[str] = None
            if asset_meta and asset_meta.get("ok"):
                asset_id = register_media_asset(
                    cur,
                    bucket=str(asset_meta["bucket"]),
                    object_key=str(asset_meta["object_key"]),
                    public_url=str(asset_meta["public_url"]),
                    mime_type=str(asset_meta["mime_type"]),
                    file_size=int(asset_meta["file_size"]),
                    sha256=asset_meta.get("sha256"),
                    entity_type="anomaly_evidence",
                    entity_id=None,
                )

            if existing:
                cur.execute(
                    """
                    UPDATE public.road_anomalies
                    SET
                        times_detected = times_detected + 1,
                        frames_tracked = GREATEST(frames_tracked, %(frames_tracked)s),
                        confidence = GREATEST(confidence, %(confidence)s),
                        estimated_area_cm2 = GREATEST(estimated_area_cm2, %(estimated_area_cm2)s),
                        sharpness_score = GREATEST(sharpness_score, %(sharpness_score)s),
                        severity = %(severity)s,
                        base_severity = COALESCE(base_severity, %(base_severity)s),
                        proximity_boost = proximity_boost OR %(proximity_boost)s,
                        nearby_poi_name = COALESCE(nearby_poi_name, %(nearby_poi_name)s),
                        nearby_poi_type = COALESCE(nearby_poi_type, %(nearby_poi_type)s),
                        nearby_poi_distance_m = COALESCE(nearby_poi_distance_m, %(nearby_poi_distance_m)s),
                        updated_at = NOW()
                    WHERE id = %(id)s
                    RETURNING id, anomaly_code, times_detected, street_name;
                    """,
                    {
                        "id": existing["id"],
                        "frames_tracked": frames_tracked,
                        "confidence": confidence,
                        "estimated_area_cm2": estimated_area_cm2,
                        "sharpness_score": sharpness_score,
                        "severity": final_severity,
                        "base_severity": priority_info["base_severity"],
                        "proximity_boost": priority_info["proximity_boost"],
                        "nearby_poi_name": nearby_poi["name"] if nearby_poi else None,
                        "nearby_poi_type": nearby_poi["label_pt"] if nearby_poi else None,
                        "nearby_poi_distance_m": nearby_poi["distance_m"] if nearby_poi else None,
                    },
                )
                updated = cur.fetchone()
                if asset_id:
                    cur.execute(
                        """
                        INSERT INTO public.anomaly_evidence (anomaly_id, asset_id, is_primary)
                        VALUES (%(anomaly_id)s, %(asset_id)s::uuid, FALSE)
                        ON CONFLICT (anomaly_id, asset_id) DO NOTHING;
                        """,
                        {"anomaly_id": existing["id"], "asset_id": asset_id},
                    )
                conn.commit()
                return {
                    "storage": "postgis",
                    "deduplicated": True,
                    "anomaly_id": updated["anomaly_code"],
                    "times_detected": updated["times_detected"],
                    "street_name": updated["street_name"] or street_name,
                    "parish": parish,
                    "freguesia": parish,
                    "roadnumber": enrichment.get("roadnumber"),
                    "categoria": enrichment.get("categoria"),
                    "n_vias": enrichment.get("n_vias"),
                    "gestao": enrichment.get("gestao"),
                    "sla_exempt": bool(enrichment.get("sla_exempt", False)),
                    "road_class": road_class,
                    "snapped": bool(road_match["snapped"]),
                    "snap_distance_m": snap_distance_m,
                    "raw_lat": lat,
                    "raw_lng": lng,
                    "lat": final_lat,
                    "lng": final_lng,
                    "severity": final_severity,
                    "base_severity": priority_info["base_severity"],
                    "proximity_boost": priority_info["proximity_boost"],
                    "nearby_poi": nearby_poi,
                    "estimated_area_cm2": estimated_area_cm2,
                    "sharpness_score": sharpness_score,
                    "frames_tracked": frames_tracked,
                }

            anomaly_code = f"CID-{uuid.uuid4().hex[:6].upper()}"
            cur.execute(
                """
                INSERT INTO public.road_anomalies (
                    anomaly_code,
                    anomaly_type,
                    title,
                    confidence,
                    coverage_pct,
                    estimated_area_cm2,
                    sharpness_score,
                    base_severity,
                    severity,
                    proximity_boost,
                    nearby_poi_name,
                    nearby_poi_type,
                    nearby_poi_distance_m,
                    source,
                    review_status,
                    repair_status,
                    description,
                    street_name,
                    parish,
                    road_class,
                    roadnumber,
                    categoria,
                    gestao,
                    n_vias,
                    sla_exempt,
                    snap_distance_m,
                    raw_lat,
                    raw_lng,
                    primary_asset_id,
                    image_key,
                    image_url,
                    bbox,
                    times_detected,
                    frames_tracked,
                    lat,
                    lng,
                    geom
                ) VALUES (
                    %(anomaly_code)s,
                    %(anomaly_type)s,
                    %(title)s,
                    %(confidence)s,
                    %(coverage_pct)s,
                    %(estimated_area_cm2)s,
                    %(sharpness_score)s,
                    %(base_severity)s,
                    %(severity)s,
                    %(proximity_boost)s,
                    %(nearby_poi_name)s,
                    %(nearby_poi_type)s,
                    %(nearby_poi_distance_m)s,
                    %(source)s,
                    'pending_human_review',
                    'Pendente',
                    %(description)s,
                    %(street_name)s,
                    %(parish)s,
                    %(road_class)s,
                    %(roadnumber)s,
                    %(categoria)s,
                    %(gestao)s,
                    %(n_vias)s,
                    %(sla_exempt)s,
                    %(snap_distance_m)s,
                    %(raw_lat)s,
                    %(raw_lng)s,
                    %(primary_asset_id)s::uuid,
                    %(image_key)s,
                    %(image_url)s,
                    %(bbox)s::jsonb,
                    1,
                    %(frames_tracked)s,
                    %(lat)s,
                    %(lng)s,
                    ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography
                )
                RETURNING id, anomaly_code;
                """,
                {
                    "anomaly_code": anomaly_code,
                    "anomaly_type": anomaly_type,
                    "title": f"{anomaly_type} · {street_name}",
                    "confidence": confidence,
                    "coverage_pct": coverage_pct,
                    "estimated_area_cm2": estimated_area_cm2,
                    "sharpness_score": sharpness_score,
                    "base_severity": priority_info["base_severity"],
                    "severity": final_severity,
                    "proximity_boost": priority_info["proximity_boost"],
                    "nearby_poi_name": nearby_poi["name"] if nearby_poi else None,
                    "nearby_poi_type": nearby_poi["label_pt"] if nearby_poi else None,
                    "nearby_poi_distance_m": nearby_poi["distance_m"] if nearby_poi else None,
                    "source": source,
                    "description": description,
                    "street_name": street_name,
                    "parish": parish,
                    "road_class": road_class,
                    "roadnumber": enrichment.get("roadnumber"),
                    "categoria": enrichment.get("categoria"),
                    "gestao": enrichment.get("gestao") or "Câmara Municipal de Loulé",
                    "n_vias": enrichment.get("n_vias"),
                    "sla_exempt": bool(enrichment.get("sla_exempt", False)),
                    "snap_distance_m": snap_distance_m,
                    "raw_lat": lat,
                    "raw_lng": lng,
                    "primary_asset_id": asset_id,
                    "image_key": (asset_meta or {}).get("object_key"),
                    "image_url": image_rel_path,
                    "bbox": json.dumps(bbox),
                    "frames_tracked": frames_tracked,
                    "lat": final_lat,
                    "lng": final_lng,
                },
            )
            inserted = cur.fetchone()
            if asset_id:
                cur.execute(
                    """
                    INSERT INTO public.anomaly_evidence (anomaly_id, asset_id, is_primary)
                    VALUES (%(anomaly_id)s, %(asset_id)s::uuid, TRUE)
                    ON CONFLICT (anomaly_id, asset_id) DO NOTHING;
                    """,
                    {"anomaly_id": inserted["id"], "asset_id": asset_id},
                )
            conn.commit()
            return {
                "storage": "postgis",
                "deduplicated": False,
                "anomaly_id": inserted["anomaly_code"],
                "times_detected": 1,
                "street_name": street_name,
                "parish": parish,
                "freguesia": parish,
                "roadnumber": enrichment.get("roadnumber"),
                "categoria": enrichment.get("categoria"),
                "n_vias": enrichment.get("n_vias"),
                "gestao": enrichment.get("gestao"),
                "sla_exempt": bool(enrichment.get("sla_exempt", False)),
                "road_class": road_class,
                "snapped": bool(road_match["snapped"]),
                "snap_distance_m": snap_distance_m,
                "raw_lat": lat,
                "raw_lng": lng,
                "lat": final_lat,
                "lng": final_lng,
                "severity": final_severity,
                "base_severity": priority_info["base_severity"],
                "proximity_boost": priority_info["proximity_boost"],
                "nearby_poi": nearby_poi,
                "estimated_area_cm2": estimated_area_cm2,
                "sharpness_score": sharpness_score,
                "frames_tracked": frames_tracked,
            }


def _persist_anomaly_local(
    *,
    anomaly_type: str,
    confidence: float,
    coverage_pct: float,
    severity: str,
    lat: float,
    lng: float,
    image_rel_path: str,
    bbox: dict[str, Any],
    description: Optional[str],
    source: str,
    estimated_area_cm2: float = 0.0,
    sharpness_score: float = 0.0,
    frames_tracked: int = 1,
) -> dict[str, Any]:
    """Local JSON fallback with road map-matching, 3m deduplication & 100m buffer priority boost."""
    road_match = snap_to_road_network(lat, lng, cur=None)
    final_lat = float(road_match["lat"])
    final_lng = float(road_match["lng"])
    street_name = str(road_match["street_name"])
    parish = str(road_match["parish"])
    road_class = str(road_match["road_class"])
    snap_distance_m = float(road_match["snap_distance_m"])

    enrichment = enrich_anomaly_location(None, final_lat, final_lng)
    if enrichment.get("freguesia"):
        parish = str(enrichment["freguesia"])

    priority_info = apply_spatial_priority_boost(
        base_severity=severity,
        lat=final_lat,
        lng=final_lng,
        cur=None,
    )
    final_severity = priority_info["severity"]
    nearby_poi = priority_info["nearby_poi"]

    with LOCAL_STORE_LOCK:
        records: list[dict[str, Any]] = []
        if LOCAL_STORE_PATH.exists():
            try:
                records = json.loads(LOCAL_STORE_PATH.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                records = []

        for item in records:
            dist = _haversine_meters(final_lat, final_lng, float(item["lat"]), float(item["lng"]))
            if dist <= DEDUP_RADIUS_METERS:
                item["times_detected"] = int(item.get("times_detected", 1)) + 1
                photos = item.setdefault("evidence_photos", [])
                photos.append(image_rel_path)
                item["confidence"] = max(float(item.get("confidence", 0.0)), confidence)
                item["estimated_area_cm2"] = max(
                    float(item.get("estimated_area_cm2", 0.0)),
                    estimated_area_cm2,
                )
                item["sharpness_score"] = max(
                    float(item.get("sharpness_score", 0.0)),
                    sharpness_score,
                )
                item["severity"] = final_severity
                item["base_severity"] = priority_info["base_severity"]
                item["proximity_boost"] = priority_info["proximity_boost"]
                item["nearby_poi"] = nearby_poi
                item["updated_at"] = datetime.now(timezone.utc).isoformat()
                LOCAL_STORE_PATH.write_text(
                    json.dumps(records, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
                return {
                    "storage": "local_json",
                    "deduplicated": True,
                    "anomaly_id": item["anomaly_code"],
                    "times_detected": item["times_detected"],
                    "street_name": item.get("street_name", street_name),
                    "parish": item.get("parish", parish),
                    "road_class": item.get("road_class", road_class),
                    "snapped": bool(road_match["snapped"]),
                    "snap_distance_m": snap_distance_m,
                    "raw_lat": lat,
                    "raw_lng": lng,
                    "lat": float(item["lat"]),
                    "lng": float(item["lng"]),
                    "severity": final_severity,
                    "base_severity": priority_info["base_severity"],
                    "proximity_boost": priority_info["proximity_boost"],
                    "nearby_poi": nearby_poi,
                    "estimated_area_cm2": item["estimated_area_cm2"],
                    "sharpness_score": item["sharpness_score"],
                    "frames_tracked": frames_tracked,
                }

        anomaly_code = f"CID-{uuid.uuid4().hex[:6].upper()}"
        new_item = {
            "anomaly_code": anomaly_code,
            "anomaly_type": anomaly_type,
            "confidence": round(confidence, 4),
            "coverage_pct": round(coverage_pct, 3),
            "estimated_area_cm2": round(estimated_area_cm2, 1),
            "sharpness_score": round(sharpness_score, 3),
            "base_severity": priority_info["base_severity"],
            "severity": final_severity,
            "proximity_boost": priority_info["proximity_boost"],
            "nearby_poi": nearby_poi,
            "source": source,
            "review_status": "pending_human_review",
            "description": description,
            "street_name": street_name,
            "parish": parish,
            "freguesia": parish,
            "roadnumber": enrichment.get("roadnumber"),
            "categoria": enrichment.get("categoria"),
            "n_vias": enrichment.get("n_vias"),
            "gestao": enrichment.get("gestao"),
            "sla_exempt": bool(enrichment.get("sla_exempt", False)),
            "road_class": road_class,
            "snapped": bool(road_match["snapped"]),
            "snap_distance_m": snap_distance_m,
            "raw_lat": lat,
            "raw_lng": lng,
            "image_path": image_rel_path,
            "evidence_photos": [image_rel_path],
            "bbox": bbox,
            "times_detected": 1,
            "frames_tracked": frames_tracked,
            "lat": final_lat,
            "lng": final_lng,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        records.append(new_item)
        LOCAL_STORE_PATH.write_text(
            json.dumps(records, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return {
            "storage": "local_json",
            "deduplicated": False,
            "anomaly_id": anomaly_code,
            "times_detected": 1,
            "street_name": street_name,
            "parish": parish,
            "freguesia": parish,
            "roadnumber": enrichment.get("roadnumber"),
            "categoria": enrichment.get("categoria"),
            "n_vias": enrichment.get("n_vias"),
            "gestao": enrichment.get("gestao"),
            "sla_exempt": bool(enrichment.get("sla_exempt", False)),
            "road_class": road_class,
            "snapped": bool(road_match["snapped"]),
            "snap_distance_m": snap_distance_m,
            "raw_lat": lat,
            "raw_lng": lng,
            "lat": final_lat,
            "lng": final_lng,
            "severity": final_severity,
            "base_severity": priority_info["base_severity"],
            "proximity_boost": priority_info["proximity_boost"],
            "nearby_poi": nearby_poi,
            "estimated_area_cm2": round(estimated_area_cm2, 1),
            "sharpness_score": round(sharpness_score, 3),
            "frames_tracked": frames_tracked,
        }


def _persist_anomaly(**kwargs: Any) -> dict[str, Any]:
    postgis_result = _persist_anomaly_postgis(**kwargs)
    if postgis_result is not None:
        return postgis_result
    return _persist_anomaly_local(**kwargs)


def _resize_aspect_fit(image_bgr: np.ndarray, max_dim: int = 1280) -> np.ndarray:
    """Downscale large uploads preserving aspect ratio so max(h, w) <= max_dim."""
    h, w = image_bgr.shape[:2]
    longest = max(h, w)
    if longest <= max_dim:
        return image_bgr
    scale = max_dim / float(longest)
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    return cv2.resize(image_bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)


@router.post("/report-photo")
async def report_photo(
    image: UploadFile = File(...),
    lat: float = Form(...),
    lng: float = Form(...),
    description: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
) -> dict[str, Any]:
    if not (-90.0 <= lat <= 90.0) or not (-180.0 <= lng <= 180.0):
        raise HTTPException(status_code=422, detail="Coordenadas GPS inválidas.")

    raw_bytes = await image.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Ficheiro de imagem vazio.")

    np_buf = np.frombuffer(raw_bytes, dtype=np.uint8)
    frame_bgr = cv2.imdecode(np_buf, cv2.IMREAD_COLOR)
    if frame_bgr is None:
        raise HTTPException(status_code=400, detail="Formato de imagem não suportado.")

    frame_bgr = _resize_aspect_fit(frame_bgr, max_dim=1280)

    quality_gate = check_image_quality_gate(frame_bgr)
    if not quality_gate["accepted"]:
        return {
            "status": "rejected_by_quality_gate",
            "reason": quality_gate["reason"],
            "message": quality_gate["message_pt"],
            "quality_gate": quality_gate,
            "max_confidence": 0.0,
            "detections": [],
        }

    predictor = _get_predictor()
    records, _, _ = predictor.predict(frame_bgr, save=False)
    detections = records[0]["detections"] if records else []

    max_conf = max((float(d["confidence"]) for d in detections), default=0.0)
    if not detections or max_conf < AI_CONFIDENCE_GATE:
        return {
            "status": "rejected_by_ai",
            "message": (
                "A IA não detetou anomalias viárias com confiança suficiente "
                f"(máximo {max_conf * 100:.1f}%, mínimo exigido {AI_CONFIDENCE_GATE * 100:.0f}%). "
                "Aproxime a câmara do pavimento com boa iluminação e tente novamente."
            ),
            "max_confidence": round(max_conf, 4),
            "detections": [],
        }

    best_det = max(detections, key=lambda d: float(d["confidence"]))
    coverage_pct = float(best_det.get("area_pct", 0.0))
    bbox = {
        "x1": best_det["x1"],
        "y1": best_det["y1"],
        "x2": best_det["x2"],
        "y2": best_det["y2"],
    }
    h_img, w_img = frame_bgr.shape[:2]
    estimated_area_cm2 = HomographyAreaEstimator.estimate_bbox_area_cm2(
        bbox, w_img, h_img, coverage_pct
    )
    sharpness_score = compute_roi_sharpness(frame_bgr, bbox)
    base_severity = severity_from_area_cm2(estimated_area_cm2, coverage_pct)
    anomaly_type = _resolve_anomaly_label(category)

    sanitized_bgr = _blur_privacy_regions(frame_bgr)
    photo_filename = f"citizen_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}.jpg"
    stored_img = _store_evidence_image_r2(sanitized_bgr, photo_filename, quality=90)

    persisted = _persist_anomaly(
        anomaly_type=anomaly_type,
        confidence=float(best_det["confidence"]),
        coverage_pct=coverage_pct,
        severity=base_severity,
        lat=lat,
        lng=lng,
        image_rel_path=str(stored_img["image_url"]),
        bbox=bbox,
        description=description,
        source="citizen_eu_participo",
        estimated_area_cm2=estimated_area_cm2,
        sharpness_score=sharpness_score,
        asset_meta=stored_img.get("asset_meta"),
    )

    final_severity = persisted.get("severity", base_severity)
    poi_note = ""
    if persisted.get("proximity_boost") and persisted.get("nearby_poi"):
        poi = persisted["nearby_poi"]
        poi_note = f" • Prioridade agravada ({poi['label_pt']} a {poi['distance_m']} m)"

    return {
        "status": "accepted",
        "message": (
            f"Anomalia confirmada: {anomaly_type} "
            f"({float(best_det['confidence']) * 100:.0f}% confiança) • "
            f"~{estimated_area_cm2:.0f} cm² • Gravidade {final_severity}"
            f"{poi_note} • Registado em {persisted['street_name']}"
        ),
        "anomaly_id": persisted["anomaly_id"],
        "anomaly_type": anomaly_type,
        "confidence": round(float(best_det["confidence"]), 4),
        "coverage_pct": round(coverage_pct, 3),
        "estimated_area_cm2": estimated_area_cm2,
        "sharpness_score": sharpness_score,
        "base_severity": persisted.get("base_severity", base_severity),
        "severity": final_severity,
        "proximity_boost": bool(persisted.get("proximity_boost", False)),
        "nearby_poi": persisted.get("nearby_poi"),
        "review_status": "pending_human_review",
        "source": "citizen_eu_participo",
        "deduplicated": persisted["deduplicated"],
        "times_detected": persisted["times_detected"],
        "street_name": persisted["street_name"],
        "parish": persisted.get("parish", "Loulé"),
        "road_class": persisted.get("road_class", "Rua Local"),
        "snapped": bool(persisted.get("snapped", False)),
        "snap_distance_m": persisted.get("snap_distance_m", 0.0),
        "raw_lat": persisted.get("raw_lat", lat),
        "raw_lng": persisted.get("raw_lng", lng),
        "lat": persisted["lat"],
        "lng": persisted["lng"],
        "image_url": f"/uploads/citizen/{photo_filename}",
        "detections_count": len(detections),
    }


def _extract_video_creation_time(video_path: Path) -> datetime:
    ffprobe_bin = shutil.which("ffprobe")
    if ffprobe_bin:
        try:
            proc = subprocess.run(
                [
                    ffprobe_bin,
                    "-v",
                    "quiet",
                    "-print_format",
                    "json",
                    "-show_format",
                    str(video_path),
                ],
                capture_output=True,
                text=True,
                check=False,
                timeout=15,
            )
            if proc.returncode == 0 and proc.stdout:
                payload = json.loads(proc.stdout)
                creation_raw = payload.get("format", {}).get("tags", {}).get("creation_time")
                if creation_raw:
                    return datetime.fromisoformat(creation_raw.replace("Z", "+00:00"))
        except Exception:
            pass
    return datetime.now(timezone.utc)


def _parse_gpx_points(gpx_bytes: bytes) -> list[dict[str, Any]]:
    points: list[dict[str, Any]] = []
    if gpxpy is not None:
        gpx = gpxpy.parse(gpx_bytes.decode("utf-8", errors="ignore"))
        for track in gpx.tracks:
            for segment in track.segments:
                for pt in segment.points:
                    if pt.time is not None:
                        points.append(
                            {
                                "time": pt.time.astimezone(timezone.utc),
                                "lat": float(pt.latitude),
                                "lng": float(pt.longitude),
                            }
                        )
    else:
        root = ET.fromstring(gpx_bytes)
        for trkpt in root.iter():
            if trkpt.tag.endswith("trkpt"):
                lat_attr = trkpt.attrib.get("lat")
                lon_attr = trkpt.attrib.get("lon")
                time_el = next((c for c in trkpt if c.tag.endswith("time")), None)
                if lat_attr and lon_attr and time_el is not None and time_el.text:
                    dt = datetime.fromisoformat(time_el.text.strip().replace("Z", "+00:00"))
                    points.append(
                        {
                            "time": dt.astimezone(timezone.utc),
                            "lat": float(lat_attr),
                            "lng": float(lon_attr),
                        }
                    )

    points.sort(key=lambda item: item["time"])
    for idx, pt in enumerate(points):
        if idx == 0:
            pt["speed_kmh"] = 25.0
            continue
        prev = points[idx - 1]
        dt_s = max(0.1, (pt["time"] - prev["time"]).total_seconds())
        dist_m = _haversine_meters(prev["lat"], prev["lng"], pt["lat"], pt["lng"])
        pt["speed_kmh"] = (dist_m / dt_s) * 3.6
    return points


def _interpolate_gpx(
    points: list[dict[str, Any]],
    target_time: datetime,
) -> tuple[float, float, float]:
    if not points:
        return (37.1364, -8.0205, 30.0)
    if target_time <= points[0]["time"]:
        return (points[0]["lat"], points[0]["lng"], points[0]["speed_kmh"])
    if target_time >= points[-1]["time"]:
        return (points[-1]["lat"], points[-1]["lng"], points[-1]["speed_kmh"])

    for idx in range(1, len(points)):
        p0, p1 = points[idx - 1], points[idx]
        if p0["time"] <= target_time <= p1["time"]:
            span = max(0.001, (p1["time"] - p0["time"]).total_seconds())
            alpha = (target_time - p0["time"]).total_seconds() / span
            lat = p0["lat"] + alpha * (p1["lat"] - p0["lat"])
            lng = p0["lng"] + alpha * (p1["lng"] - p0["lng"])
            speed = p0["speed_kmh"] + alpha * (p1["speed_kmh"] - p0["speed_kmh"])
            return (lat, lng, speed)

    return (points[-1]["lat"], points[-1]["lng"], points[-1]["speed_kmh"])


def _process_video_job(
    job_id: str,
    video_path: Path,
    gpx_points: list[dict[str, Any]],
) -> None:
    with _JOBS_LOCK:
        _JOBS[job_id]["status"] = "processing"

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        with _JOBS_LOCK:
            _JOBS[job_id]["status"] = "failed"
            _JOBS[job_id]["error"] = "Não foi possível abrir o ficheiro de vídeo."
        return

    try:
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
        if fps <= 0.0:
            fps = 30.0
        frame_step = max(1, round(fps / TARGET_SAMPLE_FPS))
        creation_time = _extract_video_creation_time(video_path)
        predictor = _get_predictor()

        deduplicator = TrackDeduplicator()
        frames_sampled = 0
        frames_skipped_stationary = 0
        frames_skipped_quality = 0
        frame_idx = 0

        while True:
            ok, frame_bgr = cap.read()
            if not ok:
                break

            if frame_idx % frame_step != 0:
                frame_idx += 1
                continue

            frames_sampled += 1
            timestamp_s = frame_idx / fps
            frame_time = creation_time + timedelta(seconds=timestamp_s)
            lat, lng, speed_kmh = _interpolate_gpx(gpx_points, frame_time)

            if gpx_points and speed_kmh < MIN_VIDEO_SPEED_KMH:
                frames_skipped_stationary += 1
                frame_idx += 1
                continue

            quality_gate = check_image_quality_gate(frame_bgr)
            if not quality_gate["accepted"]:
                frames_skipped_quality += 1
                frame_idx += 1
                continue

            results = predictor.model.track(
                source=frame_bgr,
                persist=True,
                tracker="bytetrack.yaml",
                conf=AI_CONFIDENCE_GATE,
                iou=0.70,
                imgsz=1280,
                verbose=False,
            )
            if results and results[0].boxes is not None and len(results[0].boxes) > 0:
                boxes = results[0].boxes
                h, w = frame_bgr.shape[:2]
                frame_area = max(1, h * w)
                xyxy_list = boxes.xyxy.cpu().tolist()
                conf_list = boxes.conf.cpu().tolist()
                id_list = (
                    boxes.id.int().cpu().tolist()
                    if boxes.id is not None
                    else list(range(len(xyxy_list)))
                )

                for tid, coords, conf_val in zip(id_list, xyxy_list, conf_list):
                    x1, y1, x2, y2 = coords
                    bbox = {"x1": x1, "y1": y1, "x2": x2, "y2": y2}
                    coverage_pct = ((x2 - x1) * (y2 - y1) / frame_area) * 100.0
                    area_cm2 = HomographyAreaEstimator.estimate_bbox_area_cm2(
                        bbox, w, h, coverage_pct
                    )
                    deduplicator.update_track(
                        int(tid),
                        frame_bgr=frame_bgr,
                        bbox=bbox,
                        confidence=float(conf_val),
                        area_pct=coverage_pct,
                        area_cm2=area_cm2,
                        lat=lat,
                        lng=lng,
                        timestamp_s=timestamp_s,
                    )

            frame_idx += 1

        persisted_ids: list[str] = []
        for cluster in deduplicator.flush_all(min_frames=1):
            tid = cluster["track_id"]
            sanitized = _blur_privacy_regions(cluster["frame"])
            filename = f"video_{job_id}_track_{tid}.jpg"
            stored_img = _store_evidence_image_r2(sanitized, filename, quality=88)
            base_sev = severity_from_area_cm2(
                cluster["area_cm2"],
                cluster["coverage_pct"],
            )
            saved = _persist_anomaly(
                anomaly_type="Buraco no Pavimento",
                confidence=cluster["confidence"],
                coverage_pct=cluster["coverage_pct"],
                severity=base_sev,
                lat=cluster["lat"],
                lng=cluster["lng"],
                image_rel_path=str(stored_img["image_url"]),
                bbox=cluster["bbox"],
                description=(
                    f"Deteção automática em vídeo de percurso "
                    f"(Track #{tid} • {cluster['frames_seen']} fotogramas analisados)."
                ),
                source="citizen_video_audit",
                estimated_area_cm2=cluster["area_cm2"],
                sharpness_score=cluster["sharpness"],
                frames_tracked=cluster["frames_seen"],
                asset_meta=stored_img.get("asset_meta"),
            )
            persisted_ids.append(saved["anomaly_id"])

        with _JOBS_LOCK:
            _JOBS[job_id].update(
                {
                    "status": "completed",
                    "frames_sampled": frames_sampled,
                    "frames_skipped_stationary": frames_skipped_stationary,
                    "frames_skipped_quality": frames_skipped_quality,
                    "unique_anomalies": len(persisted_ids),
                    "anomaly_ids": persisted_ids,
                }
            )
    except Exception as exc:  # pragma: no cover
        with _JOBS_LOCK:
            _JOBS[job_id]["status"] = "failed"
            _JOBS[job_id]["error"] = str(exc)
    finally:
        cap.release()


@router.post("/process-video", status_code=202)
async def process_video(
    background_tasks: BackgroundTasks,
    video: UploadFile = File(...),
    gpx_file: Optional[UploadFile] = File(None),
) -> dict[str, Any]:
    if not video.filename or not video.filename.lower().endswith((".mp4", ".mov", ".m4v")):
        raise HTTPException(
            status_code=400,
            detail="Envie um vídeo válido em formato .mp4.",
        )

    job_id = uuid.uuid4().hex[:10]
    job_dir = UPLOAD_ROOT / "jobs" / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    video_path = job_dir / Path(video.filename).name
    with video_path.open("wb") as fh:
        while chunk := await video.read(1024 * 1024):
            fh.write(chunk)

    gpx_points: list[dict[str, Any]] = []
    if gpx_file is not None and gpx_file.filename:
        gpx_bytes = await gpx_file.read()
        if gpx_bytes:
            (job_dir / Path(gpx_file.filename).name).write_bytes(gpx_bytes)
            gpx_points = _parse_gpx_points(gpx_bytes)

    with _JOBS_LOCK:
        _JOBS[job_id] = {
            "job_id": job_id,
            "status": "queued",
            "video_filename": video.filename,
            "has_gpx": bool(gpx_points),
            "gpx_points_count": len(gpx_points),
        }

    background_tasks.add_task(_process_video_job, job_id, video_path, gpx_points)

    return {
        "status": "queued",
        "job_id": job_id,
        "message": (
            "Vídeo recebido para processamento assíncrono (amostragem 6 FPS + "
            "filtro de velocidade >= 3 km/h + ByteTrack)."
        ),
        "has_gpx": bool(gpx_points),
        "gpx_points_count": len(gpx_points),
    }


@router.get("/jobs/{job_id}")
def get_video_job(job_id: str) -> dict[str, Any]:
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Tarefa de vídeo não encontrada.")
    return job
