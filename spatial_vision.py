"""Computer vision and spatial intelligence utilities for SIRI-DL.

Implements:
1. Multi-object track deduplication selecting the largest & sharpest keyframe.
2. Calibrated Bird's-Eye View (BEV) homography estimation of pothole area (cm^2).
3. 100 m spatial buffer priority boost near schools, hospitals, roundabouts, and crosswalks.
"""

from __future__ import annotations

import math
from threading import Lock
from typing import Any, Optional

import cv2
import numpy as np

SENSITIVE_BUFFER_METERS = 100.0

ZONE_TYPE_LABELS_PT: dict[str, str] = {
    "school": "Escola",
    "hospital": "Hospital",
    "roundabout": "Rotunda",
    "crosswalk": "Passadeira",
}

SEVERITY_ESCALATION: dict[str, str] = {
    "Baixa": "Média",
    "Média": "Crítica",
    "Crítica": "Crítica",
}

MAX_ROAD_SNAP_METERS = 35.0

# Reference OSM road centerlines across Loulé, Quarteira, Vilamoura, and Almancil
# used when PostGIS is unavailable (local-tangent-plane equivalent of ST_ClosestPoint).
OSM_ROAD_CENTERLINES: list[dict[str, Any]] = [
    {
        "osm_way_id": 10421001,
        "street_name": "Av. Infante de Sagres",
        "parish": "Quarteira",
        "road_class": "Av. Marginal",
        "osm_highway": "secondary",
        "coords": [(37.0684, -8.1065), (37.0689, -8.1014), (37.0695, -8.0962)],
    },
    {
        "osm_way_id": 10421002,
        "street_name": "Av. Sá Carneiro",
        "parish": "Quarteira",
        "road_class": "Urb. Arterial",
        "osm_highway": "secondary",
        "coords": [(37.0710, -8.1062), (37.0715, -8.1048), (37.0724, -8.0982)],
    },
    {
        "osm_way_id": 10421003,
        "street_name": "Rua Vasco da Gama",
        "parish": "Quarteira",
        "road_class": "Rua Local",
        "osm_highway": "residential",
        "coords": [(37.0700, -8.1070), (37.0702, -8.1056), (37.0706, -8.1030)],
    },
    {
        "osm_way_id": 10421004,
        "street_name": "Estrada da Fonte Santa",
        "parish": "Quarteira",
        "road_class": "Urb. Arterial",
        "osm_highway": "tertiary",
        "coords": [(37.0672, -8.0935), (37.0648, -8.0884), (37.0628, -8.0830)],
    },
    {
        "osm_way_id": 10421005,
        "street_name": "Av. Vilamoura XXI",
        "parish": "Vilamoura",
        "road_class": "Urb. Arterial",
        "osm_highway": "secondary",
        "coords": [(37.0825, -8.1245), (37.0815, -8.1219), (37.0801, -8.1188)],
    },
    {
        "osm_way_id": 10421006,
        "street_name": "Av. da Marina",
        "parish": "Vilamoura",
        "road_class": "Av. Marginal",
        "osm_highway": "secondary",
        "coords": [(37.0766, -8.1228), (37.0756, -8.1202), (37.0748, -8.1174)],
    },
    {
        "osm_way_id": 10421007,
        "street_name": "Av. Cerro da Vila",
        "parish": "Vilamoura",
        "road_class": "Rua Local",
        "osm_highway": "residential",
        "coords": [(37.0794, -8.1190), (37.0789, -8.1174), (37.0782, -8.1155)],
    },
    {
        "osm_way_id": 10421008,
        "street_name": "EN 125 (Km 98,4)",
        "parish": "Almancil",
        "road_class": "EN 125",
        "osm_highway": "trunk",
        "coords": [(37.0958, -8.0574), (37.0861, -8.0342), (37.0815, -8.0210)],
    },
    {
        "osm_way_id": 10421009,
        "street_name": "Av. 5 de Outubro",
        "parish": "Almancil",
        "road_class": "Urb. Arterial",
        "osm_highway": "secondary",
        "coords": [(37.0878, -8.0338), (37.0872, -8.0308), (37.0866, -8.0285)],
    },
    {
        "osm_way_id": 10421010,
        "street_name": "Av. José da Costa Mealha",
        "parish": "Loulé",
        "road_class": "Urb. Arterial",
        "osm_highway": "secondary",
        "coords": [(37.1355, -8.0238), (37.1364, -8.0205), (37.1378, -8.0178)],
    },
    {
        "osm_way_id": 10421011,
        "street_name": "Av. Marçal Pacheco",
        "parish": "Loulé",
        "road_class": "Urb. Arterial",
        "osm_highway": "secondary",
        "coords": [(37.1386, -8.0272), (37.1394, -8.0245), (37.1401, -8.0218)],
    },
    {
        "osm_way_id": 10421012,
        "street_name": "Rua Primeiro de Maio",
        "parish": "Loulé",
        "road_class": "Rua Local",
        "osm_highway": "residential",
        "coords": [(37.1381, -8.0202), (37.1385, -8.0189), (37.1390, -8.0174)],
    },
]

# Reference sensitive POIs across the Municipality of Loulé (for local / non-PostGIS fallback).
LOULE_SENSITIVE_ZONES: list[dict[str, Any]] = [
    {
        "name": "Escola Secundária de Loulé",
        "zone_type": "school",
        "label_pt": "Escola",
        "parish": "Loulé",
        "lat": 37.1394,
        "lng": -8.0218,
    },
    {
        "name": "EB 2,3 D. Dinis (Quarteira)",
        "zone_type": "school",
        "label_pt": "Escola",
        "parish": "Quarteira",
        "lat": 37.0719,
        "lng": -8.0987,
    },
    {
        "name": "Escola Básica de Almancil",
        "zone_type": "school",
        "label_pt": "Escola",
        "parish": "Almancil",
        "lat": 37.0865,
        "lng": -8.0319,
    },
    {
        "name": "Hospital de Loulé",
        "zone_type": "hospital",
        "label_pt": "Hospital",
        "parish": "Loulé",
        "lat": 37.1338,
        "lng": -8.0272,
    },
    {
        "name": "Centro de Saúde de Quarteira",
        "zone_type": "hospital",
        "label_pt": "Hospital",
        "parish": "Quarteira",
        "lat": 37.0706,
        "lng": -8.1032,
    },
    {
        "name": "Centro de Saúde de Loulé",
        "zone_type": "hospital",
        "label_pt": "Hospital",
        "parish": "Loulé",
        "lat": 37.1411,
        "lng": -8.0176,
    },
    {
        "name": "Rotunda da Av. Sá Carneiro",
        "zone_type": "roundabout",
        "label_pt": "Rotunda",
        "parish": "Quarteira",
        "lat": 37.0715,
        "lng": -8.1048,
    },
    {
        "name": "Rotunda do Polvo (Quarteira)",
        "zone_type": "roundabout",
        "label_pt": "Rotunda",
        "parish": "Quarteira",
        "lat": 37.0694,
        "lng": -8.0956,
    },
    {
        "name": "Rotunda EN 125 — Quatro Estradas",
        "zone_type": "roundabout",
        "label_pt": "Rotunda",
        "parish": "Almancil",
        "lat": 37.0958,
        "lng": -8.0574,
    },
    {
        "name": "Passadeira Av. Infante de Sagres",
        "zone_type": "crosswalk",
        "label_pt": "Passadeira",
        "parish": "Quarteira",
        "lat": 37.0689,
        "lng": -8.1014,
    },
    {
        "name": "Passadeira Av. José da Costa Mealha",
        "zone_type": "crosswalk",
        "label_pt": "Passadeira",
        "parish": "Loulé",
        "lat": 37.1364,
        "lng": -8.0205,
    },
    {
        "name": "Passadeira Av. 5 de Outubro",
        "zone_type": "crosswalk",
        "label_pt": "Passadeira",
        "parish": "Almancil",
        "lat": 37.0872,
        "lng": -8.0308,
    },
]


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


def compute_roi_sharpness(frame_bgr: np.ndarray, bbox: dict[str, float]) -> float:
    """Measure bounding-box ROI sharpness via variance of the Laplacian."""
    if frame_bgr is None or frame_bgr.size == 0:
        return 0.0

    h, w = frame_bgr.shape[:2]
    x1 = max(0, min(w - 1, int(round(float(bbox.get("x1", 0.0))))))
    y1 = max(0, min(h - 1, int(round(float(bbox.get("y1", 0.0))))))
    x2 = max(0, min(w, int(round(float(bbox.get("x2", 0.0))))))
    y2 = max(0, min(h, int(round(float(bbox.get("y2", 0.0))))))

    if (x2 - x1) < 8 or (y2 - y1) < 8:
        return 0.0

    roi = frame_bgr[y1:y2, x1:x2]
    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    return round(float(cv2.Laplacian(gray, cv2.CV_64F).var()), 3)


def compute_keyframe_quality(area_pct: float, sharpness: float, confidence: float) -> float:
    """Score keyframe candidate favoring largest bounding box, sharpest focus, and high confidence."""
    safe_area = max(0.01, float(area_pct))
    safe_sharp = max(1.0, float(sharpness))
    safe_conf = max(0.0, min(1.0, float(confidence)))
    return safe_area * math.log1p(safe_sharp) * (0.5 + 0.5 * safe_conf)


class TrackDeduplicator:
    """Thread-safe multi-object track buffer selecting one largest/sharpest keyframe per track."""

    def __init__(self) -> None:
        self.tracks: dict[int, dict[str, Any]] = {}
        self._lock = Lock()

    def update_track(
        self,
        track_id: int,
        *,
        frame_bgr: np.ndarray,
        bbox: dict[str, float],
        confidence: float,
        area_pct: float,
        area_cm2: float,
        lat: float,
        lng: float,
        timestamp_s: float,
    ) -> dict[str, Any]:
        sharpness = compute_roi_sharpness(frame_bgr, bbox)
        quality_score = compute_keyframe_quality(area_pct, sharpness, confidence)

        with self._lock:
            existing = self.tracks.get(track_id)
            if existing is None:
                entry = {
                    "track_id": int(track_id),
                    "confidence": float(confidence),
                    "coverage_pct": float(area_pct),
                    "area_cm2": float(area_cm2),
                    "sharpness": float(sharpness),
                    "quality_score": float(quality_score),
                    "lat": float(lat),
                    "lng": float(lng),
                    "bbox": dict(bbox),
                    "frame": frame_bgr.copy(),
                    "frames_seen": 1,
                    "first_seen_s": float(timestamp_s),
                    "last_seen_s": float(timestamp_s),
                }
                self.tracks[track_id] = entry
                return {
                    "frames_seen": 1,
                    "sharpness": sharpness,
                    "quality_score": quality_score,
                    "is_best_so_far": True,
                }

            existing["frames_seen"] = int(existing["frames_seen"]) + 1
            existing["last_seen_s"] = float(timestamp_s)

            is_best = quality_score > float(existing["quality_score"])
            if is_best:
                existing.update(
                    {
                        "confidence": float(confidence),
                        "coverage_pct": float(area_pct),
                        "area_cm2": float(area_cm2),
                        "sharpness": float(sharpness),
                        "quality_score": float(quality_score),
                        "lat": float(lat),
                        "lng": float(lng),
                        "bbox": dict(bbox),
                        "frame": frame_bgr.copy(),
                    }
                )

            return {
                "frames_seen": existing["frames_seen"],
                "sharpness": sharpness,
                "quality_score": quality_score,
                "is_best_so_far": is_best,
            }

    def pop_completed_tracks(
        self,
        current_time_s: float,
        max_idle_s: float = 2.0,
        min_frames: int = 1,
    ) -> list[dict[str, Any]]:
        completed: list[dict[str, Any]] = []
        with self._lock:
            expired_ids = [
                tid
                for tid, data in self.tracks.items()
                if (current_time_s - float(data["last_seen_s"])) >= max_idle_s
            ]
            for tid in expired_ids:
                item = self.tracks.pop(tid)
                if int(item["frames_seen"]) >= min_frames:
                    completed.append(item)
        return completed

    def flush_all(self, min_frames: int = 1) -> list[dict[str, Any]]:
        with self._lock:
            items = [
                item
                for item in self.tracks.values()
                if int(item["frames_seen"]) >= min_frames
            ]
            self.tracks.clear()
        return items


class HomographyAreaEstimator:
    """Bird's-Eye View (IPM) homography area estimator in cm^2 for dash-mounted 1x cameras."""

    # Normalized trapezoid on the image plane (calibrated for ~1.25 m height, ~18 deg pitch)
    SRC_NORM = np.array(
        [
            [0.36, 0.52],  # Far-left lane boundary
            [0.64, 0.52],  # Far-right lane boundary
            [0.92, 0.96],  # Near-right lane boundary
            [0.08, 0.96],  # Near-left lane boundary
        ],
        dtype=np.float32,
    )

    # Destination Bird's-Eye View rectangle in centimeters (3.5m lane width x 6.0m ahead)
    DST_CM = np.array(
        [
            [0.0, 0.0],
            [350.0, 0.0],
            [350.0, 600.0],
            [0.0, 600.0],
        ],
        dtype=np.float32,
    )

    FORESHORTENING_FACTOR = 0.38

    @classmethod
    def get_homography_matrix(cls, frame_width: int, frame_height: int) -> np.ndarray:
        safe_w = max(1.0, float(frame_width))
        safe_h = max(1.0, float(frame_height))
        src_pts = cls.SRC_NORM * np.array([safe_w, safe_h], dtype=np.float32)
        return cv2.getPerspectiveTransform(src_pts.astype(np.float32), cls.DST_CM)

    @classmethod
    def estimate_bbox_area_cm2(
        cls,
        bbox: dict[str, float],
        frame_width: int,
        frame_height: int,
        coverage_pct: float = 0.0,
    ) -> float:
        safe_w = max(1.0, float(frame_width))
        safe_h = max(1.0, float(frame_height))

        x1 = max(0.0, min(safe_w, float(bbox.get("x1", 0.0))))
        x2 = max(0.0, min(safe_w, float(bbox.get("x2", 0.0))))
        # Clamp Y into the ground-plane road band [0.45*H, 0.98*H] to avoid horizon blowups
        y_min_band = 0.45 * safe_h
        y_max_band = 0.98 * safe_h
        y1_raw = float(bbox.get("y1", 0.0))
        y2_raw = float(bbox.get("y2", 0.0))

        y1 = max(y_min_band, min(y_max_band, y1_raw))
        y2 = max(y_min_band, min(y_max_band, y2_raw))

        # Preserve minimal height in road-plane projection if full box was near horizon
        if y2 <= y1:
            box_h = max(4.0, y2_raw - y1_raw)
            y2 = min(safe_h, y1 + max(4.0, box_h * 0.5))

        if x2 <= x1:
            return round(max(25.0, float(coverage_pct) * 280.0), 1)

        H = cls.get_homography_matrix(frame_width, frame_height)
        corners = np.array(
            [
                [[x1, y1]],
                [[x2, y1]],
                [[x2, y2]],
                [[x1, y2]],
            ],
            dtype=np.float32,
        )
        projected = cv2.perspectiveTransform(corners, H).reshape(-1, 2)
        poly_area_cm2 = float(cv2.contourArea(projected.astype(np.float32)))
        estimated = poly_area_cm2 * cls.FORESHORTENING_FACTOR
        clamped = max(25.0, min(25000.0, estimated))
        return round(clamped, 1)


def severity_from_area_cm2(area_cm2: float, coverage_pct: float = 0.0) -> str:
    """Classify structural severity primarily from homography cm^2 with coverage fallback."""
    if area_cm2 >= 1500.0 or coverage_pct >= 6.0:
        return "Crítica"
    if area_cm2 >= 450.0 or coverage_pct >= 1.8:
        return "Média"
    return "Baixa"


def check_sensitive_zone_proximity(
    lat: float,
    lng: float,
    cur: Any = None,
    radius_m: float = SENSITIVE_BUFFER_METERS,
) -> Optional[dict[str, Any]]:
    """Return nearest sensitive POI within radius_m (schools, hospitals, roundabouts, crosswalks)."""
    if cur is not None:
        try:
            cur.execute(
                """
                SELECT
                    name,
                    zone_type,
                    COALESCE(parish, 'Loulé') AS parish,
                    ST_Distance(
                        geom,
                        ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography
                    ) AS distance_m
                FROM sensitive_zones
                WHERE ST_DWithin(
                    geom,
                    ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography,
                    %(radius_m)s
                )
                ORDER BY distance_m ASC
                LIMIT 1;
                """,
                {"lat": lat, "lng": lng, "radius_m": radius_m},
            )
            row = cur.fetchone()
            if row:
                ztype = str(row["zone_type"])
                return {
                    "name": str(row["name"]),
                    "zone_type": ztype,
                    "label_pt": ZONE_TYPE_LABELS_PT.get(ztype, ztype.title()),
                    "parish": str(row.get("parish") or "Loulé"),
                    "distance_m": round(float(row["distance_m"]), 1),
                }
        except Exception:
            pass

    nearest: Optional[dict[str, Any]] = None
    best_dist = float("inf")
    for poi in LOULE_SENSITIVE_ZONES:
        dist = _haversine_meters(lat, lng, float(poi["lat"]), float(poi["lng"]))
        if dist <= radius_m and dist < best_dist:
            best_dist = dist
            ztype = str(poi["zone_type"])
            nearest = {
                "name": str(poi["name"]),
                "zone_type": ztype,
                "label_pt": ZONE_TYPE_LABELS_PT.get(ztype, str(poi.get("label_pt", ztype))),
                "parish": str(poi.get("parish", "Loulé")),
                "distance_m": round(dist, 1),
            }
    return nearest


def apply_spatial_priority_boost(
    base_severity: str,
    lat: float,
    lng: float,
    cur: Any = None,
    radius_m: float = SENSITIVE_BUFFER_METERS,
) -> dict[str, Any]:
    """Boost severity priority (+1 tier) when anomaly lies within 100 m of a sensitive zone."""
    poi = check_sensitive_zone_proximity(lat, lng, cur=cur, radius_m=radius_m)
    if poi is None:
        return {
            "severity": base_severity,
            "base_severity": base_severity,
            "proximity_boost": False,
            "nearby_poi": None,
        }

    boosted = SEVERITY_ESCALATION.get(base_severity, base_severity)
    return {
        "severity": boosted,
        "base_severity": base_severity,
        "proximity_boost": True,
        "nearby_poi": poi,
    }


def _project_point_onto_segment(
    lat: float,
    lng: float,
    a_lat: float,
    a_lng: float,
    b_lat: float,
    b_lng: float,
) -> tuple[float, float, float]:
    """Project (lat, lng) onto segment A->B in local tangent plane, returning (snap_lat, snap_lng, dist_m)."""
    cos_lat = math.cos(math.radians(lat))
    m_per_deg_lat = 111_132.0
    m_per_deg_lng = 111_320.0 * max(0.1, cos_lat)

    ax = (a_lng - lng) * m_per_deg_lng
    ay = (a_lat - lat) * m_per_deg_lat
    bx = (b_lng - lng) * m_per_deg_lng
    by = (b_lat - lat) * m_per_deg_lat

    dx = bx - ax
    dy = by - ay
    seg_len_sq = dx * dx + dy * dy
    if seg_len_sq <= 1e-9:
        t = 0.0
    else:
        t = max(0.0, min(1.0, -(ax * dx + ay * dy) / seg_len_sq))

    px = ax + t * dx
    py = ay + t * dy
    dist_m = math.hypot(px, py)
    snap_lat = lat + (py / m_per_deg_lat)
    snap_lng = lng + (px / m_per_deg_lng)
    return (round(snap_lat, 6), round(snap_lng, 6), round(dist_m, 2))


def snap_to_road_network(
    lat: float,
    lng: float,
    cur: Any = None,
    max_snap_m: float = MAX_ROAD_SNAP_METERS,
) -> dict[str, Any]:
    """Map-match raw GPS (3-10m drift) onto nearest OSM road centerline via ST_ClosestPoint."""
    if cur is not None:
        try:
            cur.execute(
                """
                SELECT
                    osm_way_id,
                    street_name,
                    COALESCE(parish, 'Loulé') AS parish,
                    COALESCE(road_class, 'Rua Local') AS road_class,
                    ST_Y(ST_ClosestPoint(geom, ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326))) AS snapped_lat,
                    ST_X(ST_ClosestPoint(geom, ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326))) AS snapped_lng,
                    ST_Distance(
                        geom::geography,
                        ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography
                    ) AS snap_distance_m
                FROM road_centerlines
                WHERE ST_DWithin(
                    geom::geography,
                    ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography,
                    %(max_snap_m)s
                )
                ORDER BY geom <-> ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)
                LIMIT 1;
                """,
                {"lat": lat, "lng": lng, "max_snap_m": max_snap_m},
            )
            row = cur.fetchone()
            if row:
                return {
                    "snapped": True,
                    "lat": round(float(row["snapped_lat"]), 6),
                    "lng": round(float(row["snapped_lng"]), 6),
                    "raw_lat": round(float(lat), 6),
                    "raw_lng": round(float(lng), 6),
                    "snap_distance_m": round(float(row["snap_distance_m"]), 2),
                    "street_name": str(row["street_name"]),
                    "parish": str(row["parish"]),
                    "road_class": str(row["road_class"]),
                    "osm_way_id": row.get("osm_way_id"),
                }
        except Exception:
            pass

    best_match: Optional[dict[str, Any]] = None
    best_dist = float("inf")
    for road in OSM_ROAD_CENTERLINES:
        coords = road["coords"]
        for idx in range(len(coords) - 1):
            a_lat, a_lng = coords[idx]
            b_lat, b_lng = coords[idx + 1]
            s_lat, s_lng, dist_m = _project_point_onto_segment(
                lat, lng, a_lat, a_lng, b_lat, b_lng
            )
            if dist_m <= max_snap_m and dist_m < best_dist:
                best_dist = dist_m
                best_match = {
                    "snapped": True,
                    "lat": s_lat,
                    "lng": s_lng,
                    "raw_lat": round(float(lat), 6),
                    "raw_lng": round(float(lng), 6),
                    "snap_distance_m": dist_m,
                    "street_name": str(road["street_name"]),
                    "parish": str(road["parish"]),
                    "road_class": str(road["road_class"]),
                    "osm_way_id": road.get("osm_way_id"),
                }

    if best_match is not None:
        return best_match

    return {
        "snapped": False,
        "lat": round(float(lat), 6),
        "lng": round(float(lng), 6),
        "raw_lat": round(float(lat), 6),
        "raw_lng": round(float(lng), 6),
        "snap_distance_m": 0.0,
        "street_name": "Via Municipal (Loulé)",
        "parish": "Loulé",
        "road_class": "Rua Local",
        "osm_way_id": None,
    }


def check_image_quality_gate(
    frame_bgr: Optional[np.ndarray],
    *,
    min_blur_variance: float = 35.0,
    max_glare_pct: float = 0.32,
    max_mean_brightness: float = 225.0,
    min_mean_brightness: float = 25.0,
    min_contrast_std: float = 14.0,
) -> dict[str, Any]:
    """Fast OpenCV gatekeeper rejecting motion blur, sun glare, and heavy rain/dark frames."""
    if frame_bgr is None or frame_bgr.size == 0:
        return {
            "accepted": False,
            "reason": "empty_frame",
            "message_pt": "Fotograma vazio ou ilegível — descartado.",
            "blur_variance": 0.0,
            "mean_brightness": 0.0,
            "glare_pct": 0.0,
            "dark_pct": 1.0,
            "contrast_std": 0.0,
        }

    h, w = frame_bgr.shape[:2]
    longest = max(h, w)
    if longest > 640:
        scale = 640.0 / float(longest)
        sample = cv2.resize(
            frame_bgr,
            (max(1, int(round(w * scale))), max(1, int(round(h * scale)))),
            interpolation=cv2.INTER_AREA,
        )
    else:
        sample = frame_bgr

    gray = cv2.cvtColor(sample, cv2.COLOR_BGR2GRAY)
    blur_variance = round(float(cv2.Laplacian(gray, cv2.CV_64F).var()), 2)

    hist = cv2.calcHist([gray], [0], None, [256], [0, 256]).ravel()
    total_px = max(1.0, float(gray.size))
    glare_pct = round(float(hist[245:].sum() / total_px), 4)
    dark_pct = round(float(hist[:26].sum() / total_px), 4)
    mean_brightness = round(float(np.mean(gray)), 2)
    contrast_std = round(float(np.std(gray)), 2)

    if glare_pct >= max_glare_pct or mean_brightness >= max_mean_brightness:
        return {
            "accepted": False,
            "reason": "sun_glare",
            "message_pt": (
                "Encandeamento solar intenso detetado — fotograma descartado para "
                "proteger a mediana municipal de severidade."
            ),
            "blur_variance": blur_variance,
            "mean_brightness": mean_brightness,
            "glare_pct": glare_pct,
            "dark_pct": dark_pct,
            "contrast_std": contrast_std,
        }

    if mean_brightness <= min_mean_brightness or contrast_std <= min_contrast_std:
        return {
            "accepted": False,
            "reason": "heavy_rain_or_dark",
            "message_pt": (
                "Visibilidade reduzida (chuva forte, nevoeiro ou subexposição) — "
                "fotograma descartado antes da inferência."
            ),
            "blur_variance": blur_variance,
            "mean_brightness": mean_brightness,
            "glare_pct": glare_pct,
            "dark_pct": dark_pct,
            "contrast_std": contrast_std,
        }

    if blur_variance < min_blur_variance:
        return {
            "accepted": False,
            "reason": "motion_blur",
            "message_pt": (
                "Desfocagem de movimento elevada detetada — fotograma descartado "
                "antes da inferência YOLOv11."
            ),
            "blur_variance": blur_variance,
            "mean_brightness": mean_brightness,
            "glare_pct": glare_pct,
            "dark_pct": dark_pct,
            "contrast_std": contrast_std,
        }

    return {
        "accepted": True,
        "reason": None,
        "message_pt": "Qualidade ótica aprovada.",
        "blur_variance": blur_variance,
        "mean_brightness": mean_brightness,
        "glare_pct": glare_pct,
        "dark_pct": dark_pct,
        "contrast_std": contrast_std,
    }
