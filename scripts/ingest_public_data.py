"""CLI script to ingest CAOP 2025 parishes and IP Rede Rodoviária Nacional into PostGIS (SRID 4326)."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import fiona
import geopandas as gpd
from geoalchemy2 import Geometry
from sqlalchemy import create_engine, text

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PUBLIC_DATA_DIR = PROJECT_ROOT / "public_data"

CAOP_CANDIDATES = (
    PUBLIC_DATA_DIR / "CAOP_Continente_2025-gpkg" / "Continente_CAOP2025.gpkg",
    PUBLIC_DATA_DIR / "Continente_CAOP2025.gpkg",
)
RODOVIARIA_SHP = PUBLIC_DATA_DIR / "rede-rodoviaria" / "Rede_Rodoviaria.shp"

LOULE_PARISH_TARGETS = {
    "quarteira",
    "almancil",
    "são clemente",
    "são sebastião",
    "boliqueime",
    "alte",
    "salir",
    "ameixial",
    "tôr",
}


def resolve_caop_path() -> Path:
    for candidate in CAOP_CANDIDATES:
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(
        f"CAOP 2025 GeoPackage não encontrado em: {[str(p) for p in CAOP_CANDIDATES]}"
    )


def pick_parish_layer(gpkg_path: Path) -> str:
    layers = fiona.listlayers(str(gpkg_path))
    if "cont_freguesias" in layers:
        return "cont_freguesias"
    for layer in layers:
        if "freguesia" in layer.lower():
            return layer
    raise ValueError(f"Camada de freguesias não encontrada em {gpkg_path}: {layers}")


def load_loule_parishes(gpkg_path: Path) -> gpd.GeoDataFrame:
    layer = pick_parish_layer(gpkg_path)
    gdf = gpd.read_file(gpkg_path, layer=layer)
    if gdf.crs is None:
        gdf = gdf.set_crs(epsg=3763)

    muni_col = next(
        (c for c in gdf.columns if c.lower() in ("municipio", "concelho")),
        None,
    )
    if muni_col is None:
        raise KeyError(f"Coluna município/concelho ausente em {layer}: {list(gdf.columns)}")

    parish_col = next(
        (c for c in gdf.columns if c.lower() == "freguesia"),
        None,
    )
    if parish_col is None:
        raise KeyError(f"Coluna freguesia ausente em {layer}: {list(gdf.columns)}")

    loule = gdf[gdf[muni_col].astype(str).str.strip().str.lower() == "loulé"].copy()
    if loule.empty:
        raise ValueError("Nenhuma freguesia encontrada para o município de Loulé.")

    # Ensure MultiPolygon geometry and keep clean schema
    keep_cols = [parish_col, "geometry"]
    if "dtmnfr" in loule.columns:
        keep_cols.insert(1, "dtmnfr")
    loule = loule[keep_cols].rename(columns={parish_col: "freguesia"})
    loule["municipio"] = "Loulé"
    loule = loule.to_crs(epsg=4326)
    return loule


def load_loule_roads(shp_path: Path, loule_4326: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    if not shp_path.is_file():
        raise FileNotFoundError(f"Shapefile Rede Rodoviária não encontrado: {shp_path}")

    roads = gpd.read_file(shp_path)
    if roads.crs is None:
        roads = roads.set_crs(epsg=3763)

    # Filter to Faro district and built roads in EPSG:3763 before clipping
    dist_mask = roads["distrito"].astype(str).str.strip().str.upper() == "FARO"
    est_mask = roads["estado"].astype(str).str.strip().str.lower() == "construído"
    roads_faro = roads[dist_mask & est_mask].copy()

    roads_4326 = roads_faro.to_crs(epsg=4326)
    loule_boundary = loule_4326.geometry.unary_union
    loule_roads = roads_4326[roads_4326.geometry.intersects(loule_boundary)].copy()

    cols = [c for c in ("roadnumber", "categoria", "gestao", "n_vias", "distrito", "estado") if c in loule_roads.columns]
    loule_roads = loule_roads[cols + ["geometry"]].copy()
    return loule_roads


def ingest_to_postgis(
    database_url: str,
    loule_parishes: gpd.GeoDataFrame,
    loule_roads: gpd.GeoDataFrame,
) -> None:
    engine = create_engine(database_url)
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))

    loule_parishes.to_postgis(
        "caop_freguesias",
        engine,
        if_exists="replace",
        index=True,
        index_label="id",
        dtype={"geometry": Geometry("MULTIPOLYGON", srid=4326)},
    )
    loule_roads.to_postgis(
        "ip_rede_rodoviaria",
        engine,
        if_exists="replace",
        index=True,
        index_label="id",
        dtype={"geometry": Geometry("GEOMETRY", srid=4326)},
    )

    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_caop_freguesias_geom "
                "ON caop_freguesias USING GIST (geom);"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_ip_rede_rodoviaria_geom "
                "ON ip_rede_rodoviaria USING GIST (geom);"
            )
        )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Ingestão geoespacial CAOP 2025 + Rede Rodoviária Nacional para PostGIS (SIRI-DL Loulé)."
    )
    parser.add_argument(
        "--database-url",
        default=os.getenv("DATABASE_URL", ""),
        help="URL de ligação PostgreSQL/PostGIS (ou variável DATABASE_URL).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Valida e resume os registos filtrados sem escrever no PostGIS.",
    )
    args = parser.parse_args()

    caop_path = resolve_caop_path()
    loule_parishes = load_loule_parishes(caop_path)
    loule_roads = load_loule_roads(RODOVIARIA_SHP, loule_parishes)

    found_parishes = sorted(set(loule_parishes["freguesia"].astype(str)))
    print(f"[CAOP 2025] Freguesias de Loulé carregadas ({len(loule_parishes)}): {', '.join(found_parishes)}")
    print(f"[Rede Rodoviária] Troços em Loulé (FARO + Construído): {len(loule_roads)}")

    if args.dry_run:
        print("[Dry-Run] Concluído sem alterações na base de dados.")
        return 0

    if not args.database_url:
        print("Erro: defina --database-url ou DATABASE_URL para carregar no PostGIS.", file=sys.stderr)
        return 1

    ingest_to_postgis(args.database_url, loule_parishes, loule_roads)
    print("[PostGIS] Tabelas caop_freguesias e ip_rede_rodoviaria carregadas com índices GIST.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
