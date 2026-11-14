"""Automatic spatial enrichment service (CAOP 2025 parishes + IP Rede Rodoviária Nacional)."""

from __future__ import annotations

import math
from typing import Any, Optional

GESTAO_LABELS: dict[str, str] = {
    "ip": "Infraestruturas de Portugal (IP)",
    "concessão": "Concessionária (Via do Infante / Subconcessão)",
    "concessao": "Concessionária (Via do Infante / Subconcessão)",
    "subconcessão": "Concessionária (Via do Infante / Subconcessão)",
    "subconcessao": "Concessionária (Via do Infante / Subconcessão)",
    "município": "Câmara Municipal de Loulé",
    "municipio": "Câmara Municipal de Loulé",
}

DEFAULT_MUNICIPAL_GESTAO = "Câmara Municipal de Loulé"

# Approximate parish centers in Loulé for offline fallback when PostGIS is unavailable
_PARISH_CENTERS: list[tuple[str, float, float]] = [
    ("Quarteira", 37.0695, -8.1008),
    ("Almancil", 37.0870, -8.0305),
    ("São Clemente", 37.1376, -8.0188),
    ("São Sebastião", 37.1412, -8.0345),
    ("Boliqueime", 37.1335, -8.1570),
    ("Alte", 37.2356, -8.1764),
    ("Salir", 37.2414, -8.0462),
    ("Ameixial", 37.3636, -7.9648),
    ("Tôr", 37.1972, -8.0378),
]

# Key national & concession corridors in Loulé for offline fallback (15m snap check)
_OFFLINE_IP_ROADS: list[dict[str, Any]] = [
    {
        "roadnumber": "EN125",
        "categoria": "Estrada Nacional",
        "gestao": "IP",
        "n_vias": "2",
        "coords": [(37.0890, -8.1320), (37.0878, -8.0810), (37.0865, -8.0310), (37.0790, -7.9880)],
    },
    {
        "roadnumber": "A22",
        "categoria": "Auto-estrada",
        "gestao": "Concessão",
        "n_vias": "2+2",
        "coords": [(37.1270, -8.1700), (37.1195, -8.0850), (37.1120, -8.0100), (37.1050, -7.9550)],
    },
    {
        "roadnumber": "EN270",
        "categoria": "Estrada Nacional",
        "gestao": "IP",
        "n_vias": "2",
        "coords": [(37.1460, -8.1550), (37.1390, -8.0750), (37.1372, -8.0210), (37.1430, -7.9680)],
    },
    {
        "roadnumber": "EN396",
        "categoria": "Estrada Nacional",
        "gestao": "IP",
        "n_vias": "2",
        "coords": [(37.0710, -8.0980), (37.1020, -8.0590), (37.1360, -8.0220)],
    },
]


def map_gestao_label(raw_gestao: Optional[str]) -> tuple[str, bool]:
    """Map raw Rede Rodoviária 'gestao' to standardized entity and SLA-exempt flag."""
    if not raw_gestao:
        return DEFAULT_MUNICIPAL_GESTAO, False
    norm = raw_gestao.strip().lower()
    mapped = GESTAO_LABELS.get(norm, DEFAULT_MUNICIPAL_GESTAO)
    sla_exempt = norm in {"ip", "concessão", "concessao", "subconcessão", "subconcessao"}
    return mapped, sla_exempt


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2.0) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2.0) ** 2
    return 2.0 * r * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


def _dist_to_segment_m(
    lat: float,
    lng: float,
    a_lat: float,
    a_lng: float,
    b_lat: float,
    b_lng: float,
) -> float:
    cos_lat = max(0.2, math.cos(math.radians(lat)))
    px, py = lng * cos_lat, lat
    ax, ay = a_lng * cos_lat, a_lat
    bx, by = b_lng * cos_lat, b_lat
    dx, dy = bx - ax, by - ay
    denom = dx * dx + dy * dy
    t = 0.0 if denom <= 1e-14 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / denom))
    proj_lat = a_lat + t * (b_lat - a_lat)
    proj_lng = a_lng + t * (b_lng - a_lng)
    return _haversine_m(lat, lng, proj_lat, proj_lng)


def _execute_query_one(db: Any, sql: str, params: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Execute SQL on either SQLAlchemy Session, psycopg cursor, or psycopg connection."""
    if db is None:
        return None
    try:
        # psycopg cursor
        if hasattr(db, "fetchone"):
            pg_sql = sql.replace(":lng", "%(lng)s").replace(":lat", "%(lat)s")
            db.execute(pg_sql, params)
            row = db.fetchone()
            if row is None:
                return None
            if isinstance(row, dict):
                return row
            cols = [desc[0] for desc in db.description] if getattr(db, "description", None) else []
            return dict(zip(cols, row)) if cols else None
        # psycopg connection
        if hasattr(db, "cursor"):
            pg_sql = sql.replace(":lng", "%(lng)s").replace(":lat", "%(lat)s")
            with db.cursor() as cur:
                cur.execute(pg_sql, params)
                row = cur.fetchone()
                if row is None:
                    return None
                if isinstance(row, dict):
                    return row
                cols = [desc[0] for desc in cur.description] if getattr(cur, "description", None) else []
                return dict(zip(cols, row)) if cols else None
        # SQLAlchemy Session
        if hasattr(db, "execute"):
            from sqlalchemy import text

            row = db.execute(text(sql), params).mappings().first()
            return dict(row) if row else None
    except Exception:
        return None
    return None


def enrich_anomaly_location(db: Any, lat: float, lng: float) -> dict[str, Any]:
    """Enrich coordinates with CAOP 2025 parish (ST_Contains) and IP road jurisdiction (ST_DWithin 15m)."""
    freguesia: Optional[str] = None
    roadnumber: Optional[str] = None
    categoria: Optional[str] = None
    n_vias: Optional[str] = None
    gestao_raw: Optional[str] = None
    enrichment_source = "spatial_fallback"

    if db is not None:
        parish_sql = """
            SELECT freguesia
            FROM caop_freguesias
            WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326))
            LIMIT 1;
        """
        parish_row = _execute_query_one(db, parish_sql, {"lat": lat, "lng": lng})
        if parish_row and parish_row.get("freguesia"):
            freguesia = str(parish_row["freguesia"])
            enrichment_source = "postgis_caop_ip"

        road_sql = """
            SELECT roadnumber, categoria, gestao, n_vias
            FROM ip_rede_rodoviaria
            WHERE ST_DWithin(
                geom::geography,
                ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography,
                15.0
            )
            ORDER BY geom <-> ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)
            LIMIT 1;
        """
        road_row = _execute_query_one(db, road_sql, {"lat": lat, "lng": lng})
        if road_row:
            roadnumber = road_row.get("roadnumber")
            categoria = road_row.get("categoria")
            gestao_raw = road_row.get("gestao")
            n_vias = road_row.get("n_vias")
            enrichment_source = "postgis_caop_ip"

    if not freguesia:
        best_parish, _ = min(
            ((name, _haversine_m(lat, lng, p_lat, p_lng)) for name, p_lat, p_lng in _PARISH_CENTERS),
            key=lambda item: item[1],
        )
        freguesia = best_parish

    if roadnumber is None and gestao_raw is None:
        best_dist = float("inf")
        best_road: Optional[dict[str, Any]] = None
        for road in _OFFLINE_IP_ROADS:
            coords = road["coords"]
            for i in range(len(coords) - 1):
                d = _dist_to_segment_m(lat, lng, coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1])
                if d <= 15.0 and d < best_dist:
                    best_dist = d
                    best_road = road
        if best_road is not None:
            roadnumber = best_road["roadnumber"]
            categoria = best_road["categoria"]
            gestao_raw = best_road["gestao"]
            n_vias = best_road["n_vias"]

    gestao, sla_exempt = map_gestao_label(gestao_raw)

    return {
        "freguesia": freguesia,
        "roadnumber": roadnumber,
        "categoria": categoria,
        "n_vias": n_vias,
        "gestao_raw": gestao_raw,
        "gestao": gestao,
        "sla_exempt": sla_exempt,
        "enrichment_source": enrichment_source,
    }
