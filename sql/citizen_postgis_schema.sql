-- SIRI-DL Citizen Portal ("Eu Participo") & Spatial Intelligence PostGIS Schema
-- Requires PostgreSQL 14+ with PostGIS extension enabled.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS road_centerlines (
    id BIGSERIAL PRIMARY KEY,
    osm_way_id BIGINT,
    street_name TEXT NOT NULL,
    parish TEXT NOT NULL DEFAULT 'Loulé',
    road_class TEXT NOT NULL DEFAULT 'Rua Local',
    osm_highway TEXT NOT NULL DEFAULT 'residential',
    geom geometry(LineString, 4326) NOT NULL,
    UNIQUE (street_name, parish)
);

CREATE INDEX IF NOT EXISTS idx_road_centerlines_geom
    ON road_centerlines USING GIST (geom);

INSERT INTO road_centerlines (osm_way_id, street_name, parish, road_class, osm_highway, geom)
VALUES
    (10421001, 'Av. Infante de Sagres', 'Quarteira', 'Av. Marginal', 'secondary',
     ST_GeomFromText('LINESTRING(-8.1065 37.0684, -8.1014 37.0689, -8.0962 37.0695)', 4326)),
    (10421002, 'Av. Sá Carneiro', 'Quarteira', 'Urb. Arterial', 'secondary',
     ST_GeomFromText('LINESTRING(-8.1062 37.0710, -8.1048 37.0715, -8.0982 37.0724)', 4326)),
    (10421003, 'Rua Vasco da Gama', 'Quarteira', 'Rua Local', 'residential',
     ST_GeomFromText('LINESTRING(-8.1070 37.0700, -8.1056 37.0702, -8.1030 37.0706)', 4326)),
    (10421004, 'Estrada da Fonte Santa', 'Quarteira', 'Urb. Arterial', 'tertiary',
     ST_GeomFromText('LINESTRING(-8.0935 37.0672, -8.0884 37.0648, -8.0830 37.0628)', 4326)),
    (10421005, 'Av. Vilamoura XXI', 'Vilamoura', 'Urb. Arterial', 'secondary',
     ST_GeomFromText('LINESTRING(-8.1245 37.0825, -8.1219 37.0815, -8.1188 37.0801)', 4326)),
    (10421006, 'Av. da Marina', 'Vilamoura', 'Av. Marginal', 'secondary',
     ST_GeomFromText('LINESTRING(-8.1228 37.0766, -8.1202 37.0756, -8.1174 37.0748)', 4326)),
    (10421007, 'Av. Cerro da Vila', 'Vilamoura', 'Rua Local', 'residential',
     ST_GeomFromText('LINESTRING(-8.1190 37.0794, -8.1174 37.0789, -8.1155 37.0782)', 4326)),
    (10421008, 'EN 125 (Km 98,4)', 'Almancil', 'EN 125', 'trunk',
     ST_GeomFromText('LINESTRING(-8.0574 37.0958, -8.0342 37.0861, -8.0210 37.0815)', 4326)),
    (10421009, 'Av. 5 de Outubro', 'Almancil', 'Urb. Arterial', 'secondary',
     ST_GeomFromText('LINESTRING(-8.0338 37.0878, -8.0308 37.0872, -8.0285 37.0866)', 4326)),
    (10421010, 'Av. José da Costa Mealha', 'Loulé', 'Urb. Arterial', 'secondary',
     ST_GeomFromText('LINESTRING(-8.0238 37.1355, -8.0205 37.1364, -8.0178 37.1378)', 4326)),
    (10421011, 'Av. Marçal Pacheco', 'Loulé', 'Urb. Arterial', 'secondary',
     ST_GeomFromText('LINESTRING(-8.0272 37.1386, -8.0245 37.1394, -8.0218 37.1401)', 4326)),
    (10421012, 'Rua Primeiro de Maio', 'Loulé', 'Rua Local', 'residential',
     ST_GeomFromText('LINESTRING(-8.0202 37.1381, -8.0189 37.1385, -8.0174 37.1390)', 4326))
ON CONFLICT (street_name, parish) DO NOTHING;

CREATE TABLE IF NOT EXISTS sensitive_zones (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    zone_type TEXT NOT NULL CHECK (zone_type IN ('school', 'hospital', 'roundabout', 'crosswalk')),
    parish TEXT,
    geom geography(Point, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sensitive_zones_geom
    ON sensitive_zones USING GIST (geom);

INSERT INTO sensitive_zones (name, zone_type, parish, geom)
VALUES
    ('Escola Secundária de Loulé', 'school', 'Loulé', ST_SetSRID(ST_MakePoint(-8.0218, 37.1394), 4326)::geography),
    ('EB 2,3 D. Dinis (Quarteira)', 'school', 'Quarteira', ST_SetSRID(ST_MakePoint(-8.0987, 37.0719), 4326)::geography),
    ('Escola Básica de Almancil', 'school', 'Almancil', ST_SetSRID(ST_MakePoint(-8.0319, 37.0865), 4326)::geography),
    ('Hospital de Loulé', 'hospital', 'Loulé', ST_SetSRID(ST_MakePoint(-8.0272, 37.1338), 4326)::geography),
    ('Centro de Saúde de Quarteira', 'hospital', 'Quarteira', ST_SetSRID(ST_MakePoint(-8.1032, 37.0706), 4326)::geography),
    ('Centro de Saúde de Loulé', 'hospital', 'Loulé', ST_SetSRID(ST_MakePoint(-8.0176, 37.1411), 4326)::geography),
    ('Rotunda da Av. Sá Carneiro', 'roundabout', 'Quarteira', ST_SetSRID(ST_MakePoint(-8.1048, 37.0715), 4326)::geography),
    ('Rotunda do Polvo (Quarteira)', 'roundabout', 'Quarteira', ST_SetSRID(ST_MakePoint(-8.0956, 37.0694), 4326)::geography),
    ('Rotunda EN 125 — Quatro Estradas', 'roundabout', 'Almancil', ST_SetSRID(ST_MakePoint(-8.0574, 37.0958), 4326)::geography),
    ('Passadeira Av. Infante de Sagres', 'crosswalk', 'Quarteira', ST_SetSRID(ST_MakePoint(-8.1014, 37.0689), 4326)::geography),
    ('Passadeira Av. José da Costa Mealha', 'crosswalk', 'Loulé', ST_SetSRID(ST_MakePoint(-8.0205, 37.1364), 4326)::geography),
    ('Passadeira Av. 5 de Outubro', 'crosswalk', 'Almancil', ST_SetSRID(ST_MakePoint(-8.0308, 37.0872), 4326)::geography)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS road_anomalies (
    id BIGSERIAL PRIMARY KEY,
    anomaly_code TEXT NOT NULL UNIQUE,
    anomaly_type TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL,
    coverage_pct DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    estimated_area_cm2 DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    sharpness_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    base_severity TEXT,
    severity TEXT NOT NULL CHECK (severity IN ('Baixa', 'Média', 'Crítica')),
    proximity_boost BOOLEAN NOT NULL DEFAULT FALSE,
    nearby_poi_name TEXT,
    nearby_poi_type TEXT,
    nearby_poi_distance_m DOUBLE PRECISION,
    source TEXT NOT NULL DEFAULT 'citizen_eu_participo',
    review_status TEXT NOT NULL DEFAULT 'pending_human_review',
    description TEXT,
    street_name TEXT,
    parish TEXT,
    road_class TEXT,
    snap_distance_m DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    raw_lat DOUBLE PRECISION,
    raw_lng DOUBLE PRECISION,
    image_path TEXT,
    evidence_photos JSONB NOT NULL DEFAULT '[]'::jsonb,
    bbox JSONB,
    times_detected INTEGER NOT NULL DEFAULT 1,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    geom geography(Point, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_road_anomalies_geom
    ON road_anomalies USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_road_anomalies_source_status
    ON road_anomalies (source, review_status);
