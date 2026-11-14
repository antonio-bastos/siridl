-- SIRI-DL — Esquema Geoespacial PostGIS (SRID 4326 / WGS84)
-- Camadas oficiais: CAOP 2025 (DGT) e Rede Rodoviária Nacional (IP)

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS caop_freguesias (
    id SERIAL PRIMARY KEY,
    freguesia TEXT NOT NULL,
    municipio TEXT NOT NULL DEFAULT 'Loulé',
    dtmnfr TEXT,
    geom GEOMETRY(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_caop_freguesias_geom
    ON caop_freguesias
    USING GIST (geom);

CREATE TABLE IF NOT EXISTS ip_rede_rodoviaria (
    id SERIAL PRIMARY KEY,
    roadnumber TEXT,
    categoria TEXT,
    gestao TEXT,
    n_vias TEXT,
    distrito TEXT,
    estado TEXT,
    geom GEOMETRY(Geometry, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ip_rede_rodoviaria_geom
    ON ip_rede_rodoviaria
    USING GIST (geom);

-- Colunas de enriquecimento e governação na tabela principal de anomalias
ALTER TABLE IF EXISTS anomalies
    ADD COLUMN IF NOT EXISTS freguesia TEXT,
    ADD COLUMN IF NOT EXISTS roadnumber TEXT,
    ADD COLUMN IF NOT EXISTS categoria TEXT,
    ADD COLUMN IF NOT EXISTS gestao TEXT DEFAULT 'Câmara Municipal de Loulé',
    ADD COLUMN IF NOT EXISTS n_vias TEXT,
    ADD COLUMN IF NOT EXISTS sla_exempt BOOLEAN NOT NULL DEFAULT FALSE;
