-- SIRI-DL Citizen Portal ("Eu Participo") PostGIS Schema
-- Requires PostgreSQL 14+ with PostGIS extension enabled.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS road_centerlines (
    id BIGSERIAL PRIMARY KEY,
    street_name TEXT NOT NULL,
    parish TEXT,
    road_class TEXT,
    geom geometry(LineString, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_road_centerlines_geom
    ON road_centerlines USING GIST (geom);

CREATE TABLE IF NOT EXISTS road_anomalies (
    id BIGSERIAL PRIMARY KEY,
    anomaly_code TEXT NOT NULL UNIQUE,
    anomaly_type TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL,
    coverage_pct DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    severity TEXT NOT NULL CHECK (severity IN ('Baixa', 'Média', 'Crítica')),
    source TEXT NOT NULL DEFAULT 'citizen_eu_participo',
    review_status TEXT NOT NULL DEFAULT 'pending_human_review',
    description TEXT,
    street_name TEXT,
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
