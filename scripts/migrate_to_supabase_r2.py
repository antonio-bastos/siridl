"""Idempotent end-to-end migration to Supabase PostgreSQL + PostGIS and Cloudflare R2."""

from __future__ import annotations

import json
import math
import sqlite3
import struct
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from services.r2_storage import get_r2_config, head_object, upload_object
from services.spatial_enrichment import enrich_anomaly_location
from services.supabase_db import db_connection, register_media_asset
from spatial_vision import LOULE_SENSITIVE_ZONES, OSM_ROAD_CENTERLINES

MIGRATIONS_DIR = PROJECT_ROOT / "supabase" / "migrations"
GPKG_PATH = PROJECT_ROOT / "public_data" / "CAOP_Continente_2025-gpkg" / "Continente_CAOP2025.gpkg"

# EPSG:3763 -> EPSG:4326 parameters
_A = 6378137.0
_F = 1.0 / 298.257222101
_E2 = 2 * _F - _F * _F
_EP2 = _E2 / (1.0 - _E2)
_LAT0 = math.radians(39.0 + 40.0 / 60.0 + 5.73 / 3600.0)
_LON0 = math.radians(-(8.0 + 7.0 / 60.0 + 59.19 / 3600.0))


def _meridional_arc(phi: float) -> float:
    e4 = _E2 * _E2
    e6 = e4 * _E2
    return _A * (
        (1 - _E2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi
        - (3 * _E2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * math.sin(2 * phi)
        + (15 * e4 / 256 + 45 * e6 / 1024) * math.sin(4 * phi)
        - (35 * e6 / 3072) * math.sin(6 * phi)
    )


_M0 = _meridional_arc(_LAT0)


def _tm06_to_wgs84(x: float, y: float) -> tuple[float, float]:
    m = _M0 + y
    e1 = (1.0 - math.sqrt(1.0 - _E2)) / (1.0 + math.sqrt(1.0 - _E2))
    mu = m / (_A * (1 - _E2 / 4 - 3 * _E2 * _E2 / 64 - 5 * (_E2 ** 3) / 256))
    phi1 = (
        mu
        + (3 * e1 / 2 - 27 * (e1 ** 3) / 32) * math.sin(2 * mu)
        + (21 * e1 * e1 / 16 - 55 * (e1 ** 4) / 32) * math.sin(4 * mu)
        + (151 * (e1 ** 3) / 96) * math.sin(6 * mu)
        + (1097 * (e1 ** 4) / 512) * math.sin(8 * mu)
    )
    sin_p, cos_p, tan_p = math.sin(phi1), math.cos(phi1), math.tan(phi1)
    n1 = _A / math.sqrt(1.0 - _E2 * sin_p * sin_p)
    t1 = tan_p * tan_p
    c1 = _EP2 * cos_p * cos_p
    r1 = _A * (1.0 - _E2) / ((1.0 - _E2 * sin_p * sin_p) ** 1.5)
    d = x / n1
    lat = phi1 - (n1 * tan_p / r1) * (
        d * d / 2
        - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * _EP2) * (d ** 4) / 24
        + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * _EP2 - 3 * c1 * c1) * (d ** 6) / 720
    )
    lng = _LON0 + (
        d
        - (1 + 2 * t1 + c1) * (d ** 3) / 6
        + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * _EP2 + 24 * t1 * t1) * (d ** 5) / 120
    ) / cos_p
    return round(math.degrees(lat), 6), round(math.degrees(lng), 6)


def _parse_wkb_multipolygon_wkt(buf: bytes, offset: int) -> tuple[list[str], int]:
    endian = "<" if buf[offset] == 1 else ">"
    gtype = struct.unpack_from(endian + "I", buf, offset + 1)[0] & 0xFF
    pos = offset + 5
    if gtype == 3:
        n_rings = struct.unpack_from(endian + "I", buf, pos)[0]
        pos += 4
        ring_wkts: list[str] = []
        for _ in range(n_rings):
            n_pts = struct.unpack_from(endian + "I", buf, pos)[0]
            pos += 4
            coords: list[str] = []
            for _ in range(n_pts):
                x, y = struct.unpack_from(endian + "dd", buf, pos)
                pos += 16
                lat, lng = _tm06_to_wgs84(x, y)
                coords.append(f"{lng} {lat}")
            ring_wkts.append(f"({', '.join(coords)})")
        return [f"({', '.join(ring_wkts)})"], pos
    if gtype == 6:
        n_polys = struct.unpack_from(endian + "I", buf, pos)[0]
        pos += 4
        polys: list[str] = []
        for _ in range(n_polys):
            p_list, pos = _parse_wkb_multipolygon_wkt(buf, pos)
            polys.extend(p_list)
        return polys, pos
    raise ValueError(f"Unsupported WKB type: {gtype}")


def _gpkg_blob_to_multipolygon_wkt(blob: bytes) -> str:
    flags = blob[3]
    env_ind = (flags >> 1) & 0x07
    env_sizes = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}
    polys, _ = _parse_wkb_multipolygon_wkt(blob, 8 + env_sizes[env_ind])
    return f"MULTIPOLYGON({', '.join(polys)})"


def apply_sql_migrations(conn: Any) -> list[str]:
    applied: list[str] = []
    with conn.cursor() as cur:
        for sql_file in sorted(MIGRATIONS_DIR.glob("*.sql")):
            sql_text = sql_file.read_text(encoding="utf-8")
            cur.execute(sql_text)
            applied.append(sql_file.name)
    return applied


def migrate_assets_to_r2(conn: Any) -> dict[str, str]:
    cfg = get_r2_config()
    asset_ids: dict[str, str] = {}

    files_to_migrate: list[tuple[Path, str, str, str]] = []
    ref_img = PROJECT_ROOT / "dashboard" / "public" / "assets" / "reference.jpg"
    if ref_img.is_file():
        files_to_migrate.append((ref_img, "assets/reference.jpg", "image/jpeg", "seed_reference"))

    citizen_dir = PROJECT_ROOT / "uploads" / "citizen"
    if citizen_dir.is_dir():
        for p in sorted(citizen_dir.glob("*")):
            if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}:
                ctype = "image/png" if p.suffix.lower() == ".png" else "image/jpeg"
                files_to_migrate.append((p, f"uploads/citizen/{p.name}", ctype, "anomaly_evidence"))

    with conn.cursor() as cur:
        for local_path, object_key, mime_type, entity_type in files_to_migrate:
            body = local_path.read_bytes()
            res = upload_object(object_key=object_key, body=body, content_type=mime_type, config=cfg)
            if not res.get("ok"):
                raise RuntimeError(f"Falha ao enviar {object_key} para R2: {res.get('error')}")
            asset_uuid = register_media_asset(
                cur,
                bucket=cfg["bucket"],
                object_key=object_key,
                public_url=f"/api/media/{object_key}",
                mime_type=mime_type,
                file_size=len(body),
                sha256=res.get("sha256"),
                entity_type=entity_type,
                entity_id=local_path.name,
            )
            asset_ids[object_key] = asset_uuid

    return asset_ids


def migrate_spatial_reference_layers(conn: Any) -> dict[str, int]:
    counts = {"caop_freguesias": 0, "road_centerlines": 0, "sensitive_zones": 0}
    with conn.cursor() as cur:
        if GPKG_PATH.is_file():
            gpkg_con = sqlite3.connect(str(GPKG_PATH))
            gpkg_rows = gpkg_con.execute(
                "SELECT freguesia, dtmnfr, geom FROM cont_freguesias WHERE lower(municipio) LIKE '%loul%'"
            ).fetchall()
            gpkg_con.close()
            for freguesia, dtmnfr, geom_blob in gpkg_rows:
                wkt = _gpkg_blob_to_multipolygon_wkt(geom_blob)
                cur.execute(
                    """
                    INSERT INTO public.caop_freguesias (freguesia, municipio, dtmnfr, geom)
                    VALUES (%(freguesia)s, 'Loulé', %(dtmnfr)s, ST_Multi(ST_GeomFromText(%(wkt)s, 4326)))
                    ON CONFLICT (freguesia) DO UPDATE SET
                        dtmnfr = EXCLUDED.dtmnfr,
                        geom = EXCLUDED.geom;
                    """,
                    {"freguesia": str(freguesia), "dtmnfr": str(dtmnfr or ""), "wkt": wkt},
                )
                counts["caop_freguesias"] += 1

        for road in OSM_ROAD_CENTERLINES:
            pts = ", ".join(f"{lng} {lat}" for lat, lng in road["coords"])
            wkt = f"LINESTRING({pts})"
            cur.execute(
                """
                INSERT INTO public.road_centerlines (osm_way_id, street_name, parish, road_class, osm_highway, geom)
                VALUES (%(osm_way_id)s, %(street_name)s, %(parish)s, %(road_class)s, 'secondary', ST_GeomFromText(%(wkt)s, 4326))
                ON CONFLICT (street_name, parish) DO NOTHING;
                """,
                {
                    "osm_way_id": road.get("osm_way_id"),
                    "street_name": road["street_name"],
                    "parish": road["parish"],
                    "road_class": road["road_class"],
                    "wkt": wkt,
                },
            )
            counts["road_centerlines"] += 1

        for poi in LOULE_SENSITIVE_ZONES:
            cur.execute(
                """
                INSERT INTO public.sensitive_zones (name, zone_type, parish, geom)
                VALUES (%(name)s, %(zone_type)s, %(parish)s, ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography)
                ON CONFLICT (name) DO NOTHING;
                """,
                {
                    "name": poi["name"],
                    "zone_type": poi["zone_type"],
                    "parish": poi["parish"],
                    "lat": poi["lat"],
                    "lng": poi["lng"],
                },
            )
            counts["sensitive_zones"] += 1
    return counts


def _normalize_severity(raw: str | None, area_pct: float) -> str:
    if raw in {"Baixa", "Média", "Crítica"}:
        return raw
    if area_pct >= 2.4:
        return "Crítica"
    if area_pct >= 1.35:
        return "Média"
    return "Baixa"


def migrate_application_records(conn: Any, seed_data: dict[str, Any], asset_ids: dict[str, str]) -> dict[str, int]:
    ref_asset_id = asset_ids.get("assets/reference.jpg")
    inserted_anomalies = 0
    inserted_audits = 0

    with conn.cursor() as cur:
        # 1. Entradas mock data (ANM-101 .. ANM-112)
        for item in seed_data.get("entradas", []):
            lat, lng = float(item["lat"]), float(item["lng"])
            enr = enrich_anomaly_location(cur, lat, lng)
            grav = _normalize_severity(item.get("gravidade"), float(item.get("coberturaPct", 1.5)))
            cur.execute(
                """
                INSERT INTO public.road_anomalies (
                    anomaly_code, anomaly_type, title, confidence, coverage_pct,
                    estimated_area_cm2, sharpness_score, base_severity, severity,
                    proximity_boost, nearby_poi_name, nearby_poi_type, nearby_poi_distance_m,
                    source, review_status, repair_status, description,
                    street_name, parish, road_class, roadnumber, categoria, gestao, n_vias, sla_exempt,
                    patrol_unit, patrol_kind, times_detected, primary_asset_id, image_key, image_url,
                    bbox, lat, lng, geom, created_at
                ) VALUES (
                    %(anomaly_code)s, %(anomaly_type)s, %(title)s, %(confidence)s, %(coverage_pct)s,
                    %(estimated_area_cm2)s, %(sharpness_score)s, %(base_severity)s, %(severity)s,
                    %(proximity_boost)s, %(nearby_poi_name)s, %(nearby_poi_type)s, %(nearby_poi_distance_m)s,
                    'municipal_audit', 'approved', %(repair_status)s, %(description)s,
                    %(street_name)s, %(parish)s, %(road_class)s, %(roadnumber)s, %(categoria)s, %(gestao)s, %(n_vias)s, %(sla_exempt)s,
                    %(patrol_unit)s, 'fleet_patrol', %(times_detected)s, %(primary_asset_id)s::uuid, 'assets/reference.jpg', '/api/media/assets/reference.jpg',
                    %(bbox)s::jsonb, %(lat)s, %(lng)s, ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography,
                    COALESCE(%(created_at)s::timestamptz, NOW())
                )
                ON CONFLICT (anomaly_code) DO NOTHING
                RETURNING id;
                """,
                {
                    "anomaly_code": item["id"],
                    "anomaly_type": item["tipo"],
                    "title": f"{item['tipo']} · {item['rua']}",
                    "confidence": float(item.get("confianca", 0.9)),
                    "coverage_pct": float(item.get("coberturaPct", 1.5)),
                    "estimated_area_cm2": float(item.get("areaEstimadaCm2", 1200)),
                    "sharpness_score": float(item.get("nitidezScore") or 180.0),
                    "base_severity": (item.get("proximidadeSensivel") or {}).get("gravidadeBase") or grav,
                    "severity": grav,
                    "proximity_boost": bool(item.get("proximidadeSensivel")),
                    "nearby_poi_name": (item.get("proximidadeSensivel") or {}).get("nome"),
                    "nearby_poi_type": (item.get("proximidadeSensivel") or {}).get("tipo"),
                    "nearby_poi_distance_m": (item.get("proximidadeSensivel") or {}).get("distanciaM"),
                    "repair_status": item.get("estado", "Pendente"),
                    "description": item.get("notas"),
                    "street_name": item["rua"],
                    "parish": item.get("freguesia") or enr["freguesia"],
                    "road_class": item.get("classificacaoVia", "Rua Local"),
                    "roadnumber": item.get("roadnumber") or enr.get("roadnumber"),
                    "categoria": item.get("categoria") or enr.get("categoria"),
                    "gestao": item.get("gestao") or enr["gestao"],
                    "n_vias": item.get("nVias") or enr.get("n_vias"),
                    "sla_exempt": bool(item.get("slaExempt", enr["sla_exempt"])),
                    "patrol_unit": item.get("viatura", "Viatura Fiscalização #01"),
                    "times_detected": int(item.get("recorrencia", 1)),
                    "primary_asset_id": ref_asset_id,
                    "bbox": json.dumps(item.get("bbox") or {}),
                    "lat": lat,
                    "lng": lng,
                    "created_at": item.get("ultimaDetecaoIso"),
                },
            )
            row = cur.fetchone()
            if row and ref_asset_id:
                cur.execute(
                    "INSERT INTO public.anomaly_evidence (anomaly_id, asset_id, is_primary) VALUES (%s, %s::uuid, TRUE) ON CONFLICT DO NOTHING;",
                    (row["id"], ref_asset_id),
                )
            inserted_anomalies += 1

        # 2. Map seed anomalies (SIRI_ANOMALIES + SIRI_REPAIRED_HISTORY)
        status_map = {
            "pending": "Pendente",
            "scheduled": "Agendado",
            "in_progress": "Em Reparação",
            "repaired": "Resolvido",
        }
        for item in seed_data.get("mapAnomalies", []):
            lat, lng = float(item["latitude"]), float(item["longitude"])
            enr = enrich_anomaly_location(cur, lat, lng)
            area_pct = float(item.get("area_pct", 1.5))
            grav = _normalize_severity(None, area_pct)
            cur.execute(
                """
                INSERT INTO public.road_anomalies (
                    anomaly_code, anomaly_type, title, confidence, coverage_pct,
                    estimated_area_cm2, severity, source, review_status, repair_status,
                    street_name, parish, road_class, roadnumber, categoria, gestao, n_vias, sla_exempt,
                    patrol_unit, patrol_kind, times_detected, primary_asset_id, image_key, image_url,
                    bbox, lat, lng, geom, created_at
                ) VALUES (
                    %(anomaly_code)s, %(anomaly_type)s, %(title)s, %(confidence)s, %(coverage_pct)s,
                    %(estimated_area_cm2)s, %(severity)s, %(source)s, 'approved', %(repair_status)s,
                    %(street_name)s, %(parish)s, %(road_class)s, %(roadnumber)s, %(categoria)s, %(gestao)s, %(n_vias)s, %(sla_exempt)s,
                    %(patrol_unit)s, %(patrol_kind)s, %(times_detected)s, %(primary_asset_id)s::uuid, 'assets/reference.jpg', '/api/media/assets/reference.jpg',
                    %(bbox)s::jsonb, %(lat)s, %(lng)s, ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326)::geography,
                    COALESCE(%(created_at)s::timestamptz, NOW())
                )
                ON CONFLICT (anomaly_code) DO NOTHING
                RETURNING id;
                """,
                {
                    "anomaly_code": str(item["reference"]),
                    "anomaly_type": item.get("anomaly_type", "pothole"),
                    "title": item.get("title") or item["street"],
                    "confidence": float(item.get("confidence", 0.9)),
                    "coverage_pct": area_pct,
                    "estimated_area_cm2": float(item.get("cavity_area_cm2", 1000)),
                    "severity": grav,
                    "source": item.get("source", "yolov11"),
                    "repair_status": status_map.get(item.get("repair_status", "pending"), "Pendente"),
                    "street_name": item.get("street", "Via Municipal"),
                    "parish": item.get("locality") or enr["freguesia"],
                    "road_class": item.get("road_class", "Rua Local"),
                    "roadnumber": enr.get("roadnumber"),
                    "categoria": enr.get("categoria"),
                    "gestao": enr["gestao"],
                    "n_vias": enr.get("n_vias"),
                    "sla_exempt": bool(enr["sla_exempt"]),
                    "patrol_unit": item.get("patrol_unit", "Viatura Fiscalização #01"),
                    "patrol_kind": item.get("patrol_kind", "fleet_patrol"),
                    "times_detected": int(item.get("patrol_passes", 1)),
                    "primary_asset_id": ref_asset_id,
                    "bbox": json.dumps(item.get("bboxes") or []),
                    "lat": lat,
                    "lng": lng,
                    "created_at": item.get("first_seen_at"),
                },
            )
            row = cur.fetchone()
            if row and ref_asset_id:
                cur.execute(
                    "INSERT INTO public.anomaly_evidence (anomaly_id, asset_id, is_primary) VALUES (%s, %s::uuid, TRUE) ON CONFLICT DO NOTHING;",
                    (row["id"], ref_asset_id),
                )
            inserted_anomalies += 1

        # 3. Sector Audits
        for audit in seed_data.get("audits", []):
            cur.execute(
                """
                INSERT INTO public.sector_audits (id, place, selection, filters, target)
                VALUES (%(id)s, %(place)s, %(selection)s::jsonb, %(filters)s::jsonb, %(target)s::jsonb)
                ON CONFLICT (id) DO NOTHING;
                """,
                {
                    "id": str(audit["id"]),
                    "place": str(audit.get("place", "Concelho de Loulé")),
                    "selection": json.dumps(audit["selection"]),
                    "filters": json.dumps(audit.get("filters") or {}),
                    "target": json.dumps(audit.get("target")) if audit.get("target") else None,
                },
            )
            inserted_audits += 1

    return {"anomalies_processed": inserted_anomalies, "audits_processed": inserted_audits}


def run_reconciliation(conn: Any) -> dict[str, Any]:
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) AS c FROM public.caop_freguesias;")
        caop_count = int(cur.fetchone()["c"])
        cur.execute("SELECT COUNT(*) AS c FROM public.road_centerlines;")
        roads_count = int(cur.fetchone()["c"])
        cur.execute("SELECT COUNT(*) AS c FROM public.sensitive_zones;")
        poi_count = int(cur.fetchone()["c"])
        cur.execute("SELECT COUNT(*) AS c FROM public.media_assets;")
        assets_count = int(cur.fetchone()["c"])
        cur.execute("SELECT COUNT(*) AS c FROM public.road_anomalies WHERE deleted_at IS NULL;")
        anomalies_count = int(cur.fetchone()["c"])
        cur.execute("SELECT COUNT(*) AS c FROM public.anomaly_evidence;")
        evidence_count = int(cur.fetchone()["c"])
        cur.execute("SELECT COUNT(*) AS c FROM public.sector_audits WHERE deleted_at IS NULL;")
        audits_count = int(cur.fetchone()["c"])
        cur.execute("SELECT COUNT(*) AS c FROM public.road_anomalies WHERE image_url LIKE 'data:image%';")
        base64_leaks = int(cur.fetchone()["c"])

    r2_ref_ok = head_object("assets/reference.jpg")
    return {
        "caop_freguesias": caop_count,
        "road_centerlines": roads_count,
        "sensitive_zones": poi_count,
        "media_assets": assets_count,
        "road_anomalies": anomalies_count,
        "anomaly_evidence": evidence_count,
        "sector_audits": audits_count,
        "base64_in_postgres": base64_leaks,
        "r2_reference_jpg_exists": r2_ref_ok,
    }


def main() -> int:
    seed_path = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    seed_data = json.loads(seed_path.read_text(encoding="utf-8")) if seed_path and seed_path.is_file() else {}

    with db_connection() as conn:
        applied = apply_sql_migrations(conn)
        print("MIGRATIONS_APPLIED:", applied)

        asset_ids = migrate_assets_to_r2(conn)
        print("R2_ASSETS_MIGRATED:", list(asset_ids.keys()))

        spatial_counts = migrate_spatial_reference_layers(conn)
        print("SPATIAL_LAYERS:", spatial_counts)

        app_counts = migrate_application_records(conn, seed_data, asset_ids)
        print("APP_RECORDS:", app_counts)

        recon = run_reconciliation(conn)
        print("RECONCILIATION:", json.dumps(recon, ensure_ascii=False))
        assert recon["base64_in_postgres"] == 0, "Found base64 image data in PostgreSQL!"
        assert recon["r2_reference_jpg_exists"] is True, "Missing assets/reference.jpg in R2!"
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
