-- SIRI-DL Migration 0001: Normalized Supabase PostgreSQL + PostGIS Schema
-- Target: Supabase PostgreSQL 17 + PostGIS 3.3

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Version tracking for reproducible migrations
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shared updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- 1. CAOP 2025 Parishes (Loulé)
CREATE TABLE IF NOT EXISTS public.caop_freguesias (
    id BIGSERIAL PRIMARY KEY,
    freguesia TEXT NOT NULL UNIQUE,
    municipio TEXT NOT NULL DEFAULT 'Loulé',
    dtmnfr TEXT,
    geom geometry(MultiPolygon, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_caop_freguesias_geom
    ON public.caop_freguesias USING GIST (geom);

-- 2. IP Rede Rodoviária Nacional (Loulé)
CREATE TABLE IF NOT EXISTS public.ip_rede_rodoviaria (
    id BIGSERIAL PRIMARY KEY,
    roadnumber TEXT,
    categoria TEXT,
    gestao TEXT,
    n_vias TEXT,
    distrito TEXT,
    estado TEXT,
    geom geometry(Geometry, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ip_rede_rodoviaria_geom
    ON public.ip_rede_rodoviaria USING GIST (geom);

-- 3. OSM Road Centerlines (Map-Matching via ST_ClosestPoint)
CREATE TABLE IF NOT EXISTS public.road_centerlines (
    id BIGSERIAL PRIMARY KEY,
    osm_way_id BIGINT,
    street_name TEXT NOT NULL,
    parish TEXT NOT NULL DEFAULT 'Loulé',
    road_class TEXT NOT NULL DEFAULT 'Rua Local',
    osm_highway TEXT NOT NULL DEFAULT 'residential',
    geom geometry(LineString, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (street_name, parish)
);

CREATE INDEX IF NOT EXISTS idx_road_centerlines_geom
    ON public.road_centerlines USING GIST (geom);

-- 4. Sensitive Zones (100 m Spatial Buffer Priority Boost)
CREATE TABLE IF NOT EXISTS public.sensitive_zones (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    zone_type TEXT NOT NULL CHECK (zone_type IN ('school', 'hospital', 'roundabout', 'crosswalk')),
    parish TEXT,
    geom geography(Point, 4326) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sensitive_zones_geom
    ON public.sensitive_zones USING GIST (geom);

-- 5. Centralized R2 Media Asset Registry (NO binary data in PostgreSQL)
CREATE TABLE IF NOT EXISTS public.media_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    storage_provider TEXT NOT NULL DEFAULT 'cloudflare_r2' CHECK (storage_provider IN ('cloudflare_r2')),
    bucket TEXT NOT NULL DEFAULT 'siri-dl',
    object_key TEXT NOT NULL UNIQUE,
    public_url TEXT,
    mime_type TEXT NOT NULL,
    file_size BIGINT NOT NULL CHECK (file_size >= 0),
    sha256 TEXT,
    entity_type TEXT NOT NULL DEFAULT 'anomaly_evidence',
    entity_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_assets_entity
    ON public.media_assets (entity_type, entity_id);

-- 6. Unified Road Anomalies (Map, /entradas, /participar, /captura, /detections)
CREATE TABLE IF NOT EXISTS public.road_anomalies (
    id BIGSERIAL PRIMARY KEY,
    anomaly_code TEXT NOT NULL UNIQUE,
    anomaly_type TEXT NOT NULL,
    title TEXT,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
    coverage_pct DOUBLE PRECISION NOT NULL DEFAULT 0.0 CHECK (coverage_pct >= 0.0),
    estimated_area_cm2 DOUBLE PRECISION NOT NULL DEFAULT 0.0 CHECK (estimated_area_cm2 >= 0.0),
    profundidade_cm DOUBLE PRECISION CHECK (profundidade_cm IS NULL OR profundidade_cm >= 0.0),
    sharpness_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    base_severity TEXT CHECK (base_severity IS NULL OR base_severity IN ('Baixa', 'Média', 'Crítica')),
    severity TEXT NOT NULL DEFAULT 'Média' CHECK (severity IN ('Baixa', 'Média', 'Crítica')),
    proximity_boost BOOLEAN NOT NULL DEFAULT FALSE,
    nearby_poi_name TEXT,
    nearby_poi_type TEXT,
    nearby_poi_distance_m DOUBLE PRECISION,
    source TEXT NOT NULL DEFAULT 'yolov11',
    review_status TEXT NOT NULL DEFAULT 'pending_human_review',
    repair_status TEXT NOT NULL DEFAULT 'Pendente' CHECK (repair_status IN ('Pendente', 'Agendado', 'Em Reparação', 'Resolvido')),
    description TEXT,
    street_name TEXT NOT NULL DEFAULT 'Via Municipal (Loulé)',
    parish TEXT NOT NULL DEFAULT 'Loulé',
    road_class TEXT NOT NULL DEFAULT 'Rua Local',
    roadnumber TEXT,
    categoria TEXT,
    gestao TEXT NOT NULL DEFAULT 'Câmara Municipal de Loulé',
    n_vias TEXT,
    sla_exempt BOOLEAN NOT NULL DEFAULT FALSE,
    snap_distance_m DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    raw_lat DOUBLE PRECISION,
    raw_lng DOUBLE PRECISION,
    lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90.0 AND 90.0),
    lng DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180.0 AND 180.0),
    patrol_unit TEXT DEFAULT 'Viatura Fiscalização #01',
    patrol_kind TEXT DEFAULT 'fleet_patrol',
    times_detected INTEGER NOT NULL DEFAULT 1 CHECK (times_detected >= 1),
    frames_tracked INTEGER NOT NULL DEFAULT 1 CHECK (frames_tracked >= 1),
    primary_asset_id UUID REFERENCES public.media_assets(id) ON DELETE SET NULL,
    image_key TEXT,
    image_url TEXT,
    bbox JSONB,
    geom geography(Point, 4326) NOT NULL,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_road_anomalies_geom
    ON public.road_anomalies USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_road_anomalies_parish
    ON public.road_anomalies (parish) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_road_anomalies_gestao
    ON public.road_anomalies (gestao) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_road_anomalies_status
    ON public.road_anomalies (repair_status, severity) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_road_anomalies_created_at
    ON public.road_anomalies (created_at DESC) WHERE deleted_at IS NULL;

-- 7. Normalized 1-to-Many Anomaly Evidence Photos (references media_assets in R2)
CREATE TABLE IF NOT EXISTS public.anomaly_evidence (
    id BIGSERIAL PRIMARY KEY,
    anomaly_id BIGINT NOT NULL REFERENCES public.road_anomalies(id) ON DELETE CASCADE,
    asset_id UUID NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (anomaly_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_anomaly_evidence_anomaly_id
    ON public.anomaly_evidence (anomaly_id);

-- 8. Sector Audits (Saved Map Workspace Sectors & Filters)
CREATE TABLE IF NOT EXISTS public.sector_audits (
    id TEXT PRIMARY KEY,
    place TEXT NOT NULL,
    selection JSONB NOT NULL,
    filters JSONB NOT NULL DEFAULT '{}'::jsonb,
    target JSONB,
    created_by TEXT DEFAULT 'system',
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Active Learning Hard-Negative Samples (R2 retrain_dataset/ tracking)
CREATE TABLE IF NOT EXISTS public.active_learning_samples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sample_id TEXT NOT NULL UNIQUE,
    detection_id TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('shadow', 'wet_patch', 'tar_line')),
    reason_label_pt TEXT NOT NULL,
    street_name TEXT,
    parish TEXT,
    confidence DOUBLE PRECISION,
    bbox JSONB,
    asset_id UUID REFERENCES public.media_assets(id) ON DELETE SET NULL,
    r2_bucket TEXT NOT NULL DEFAULT 'siri-dl',
    r2_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_active_learning_detection
    ON public.active_learning_samples (detection_id);

-- Triggers for updated_at
DROP TRIGGER IF EXISTS trg_caop_freguesias_updated_at ON public.caop_freguesias;
CREATE TRIGGER trg_caop_freguesias_updated_at
    BEFORE UPDATE ON public.caop_freguesias
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_ip_rede_rodoviaria_updated_at ON public.ip_rede_rodoviaria;
CREATE TRIGGER trg_ip_rede_rodoviaria_updated_at
    BEFORE UPDATE ON public.ip_rede_rodoviaria
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_media_assets_updated_at ON public.media_assets;
CREATE TRIGGER trg_media_assets_updated_at
    BEFORE UPDATE ON public.media_assets
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_road_anomalies_updated_at ON public.road_anomalies;
CREATE TRIGGER trg_road_anomalies_updated_at
    BEFORE UPDATE ON public.road_anomalies
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_sector_audits_updated_at ON public.sector_audits;
CREATE TRIGGER trg_sector_audits_updated_at
    BEFORE UPDATE ON public.sector_audits
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.schema_migrations (version, description)
VALUES ('202611140001', 'Initial normalized PostGIS + R2 media registry schema')
ON CONFLICT (version) DO NOTHING;
