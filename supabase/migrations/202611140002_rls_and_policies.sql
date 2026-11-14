-- SIRI-DL Migration 0002: Row Level Security (RLS) & Least-Privilege Access Policies

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caop_freguesias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ip_rede_rodoviaria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.road_centerlines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sensitive_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.road_anomalies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anomaly_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sector_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_learning_samples ENABLE ROW LEVEL SECURITY;

-- Helper to idempotently recreate policies
DO $$
BEGIN
    -- Public read-only access to active geospatial reference & road anomaly records
    DROP POLICY IF EXISTS "public_read_caop_freguesias" ON public.caop_freguesias;
    CREATE POLICY "public_read_caop_freguesias"
        ON public.caop_freguesias FOR SELECT
        TO anon, authenticated
        USING (true);

    DROP POLICY IF EXISTS "public_read_ip_rede_rodoviaria" ON public.ip_rede_rodoviaria;
    CREATE POLICY "public_read_ip_rede_rodoviaria"
        ON public.ip_rede_rodoviaria FOR SELECT
        TO anon, authenticated
        USING (true);

    DROP POLICY IF EXISTS "public_read_road_centerlines" ON public.road_centerlines;
    CREATE POLICY "public_read_road_centerlines"
        ON public.road_centerlines FOR SELECT
        TO anon, authenticated
        USING (true);

    DROP POLICY IF EXISTS "public_read_sensitive_zones" ON public.sensitive_zones;
    CREATE POLICY "public_read_sensitive_zones"
        ON public.sensitive_zones FOR SELECT
        TO anon, authenticated
        USING (true);

    DROP POLICY IF EXISTS "public_read_active_road_anomalies" ON public.road_anomalies;
    CREATE POLICY "public_read_active_road_anomalies"
        ON public.road_anomalies FOR SELECT
        TO anon, authenticated
        USING (deleted_at IS NULL);

    DROP POLICY IF EXISTS "public_read_media_assets" ON public.media_assets;
    CREATE POLICY "public_read_media_assets"
        ON public.media_assets FOR SELECT
        TO anon, authenticated
        USING (true);

    DROP POLICY IF EXISTS "public_read_anomaly_evidence" ON public.anomaly_evidence;
    CREATE POLICY "public_read_anomaly_evidence"
        ON public.anomaly_evidence FOR SELECT
        TO anon, authenticated
        USING (true);

    DROP POLICY IF EXISTS "public_read_active_sector_audits" ON public.sector_audits;
    CREATE POLICY "public_read_active_sector_audits"
        ON public.sector_audits FOR SELECT
        TO anon, authenticated
        USING (deleted_at IS NULL);

    -- Authenticated operators can read active_learning_samples; anon cannot
    DROP POLICY IF EXISTS "authenticated_read_active_learning" ON public.active_learning_samples;
    CREATE POLICY "authenticated_read_active_learning"
        ON public.active_learning_samples FOR SELECT
        TO authenticated
        USING (true);

    -- Service role (server-side FastAPI & Next.js API routes) has full access across all tables
    DROP POLICY IF EXISTS "service_role_all_schema_migrations" ON public.schema_migrations;
    CREATE POLICY "service_role_all_schema_migrations" ON public.schema_migrations FOR ALL TO service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "service_role_all_caop_freguesias" ON public.caop_freguesias;
    CREATE POLICY "service_role_all_caop_freguesias" ON public.caop_freguesias FOR ALL TO service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "service_role_all_ip_rede_rodoviaria" ON public.ip_rede_rodoviaria;
    CREATE POLICY "service_role_all_ip_rede_rodoviaria" ON public.ip_rede_rodoviaria FOR ALL TO service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "service_role_all_road_centerlines" ON public.road_centerlines;
    CREATE POLICY "service_role_all_road_centerlines" ON public.road_centerlines FOR ALL TO service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "service_role_all_sensitive_zones" ON public.sensitive_zones;
    CREATE POLICY "service_role_all_sensitive_zones" ON public.sensitive_zones FOR ALL TO service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "service_role_all_media_assets" ON public.media_assets;
    CREATE POLICY "service_role_all_media_assets" ON public.media_assets FOR ALL TO service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "service_role_all_road_anomalies" ON public.road_anomalies;
    CREATE POLICY "service_role_all_road_anomalies" ON public.road_anomalies FOR ALL TO service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "service_role_all_anomaly_evidence" ON public.anomaly_evidence;
    CREATE POLICY "service_role_all_anomaly_evidence" ON public.anomaly_evidence FOR ALL TO service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "service_role_all_sector_audits" ON public.sector_audits;
    CREATE POLICY "service_role_all_sector_audits" ON public.sector_audits FOR ALL TO service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "service_role_all_active_learning_samples" ON public.active_learning_samples;
    CREATE POLICY "service_role_all_active_learning_samples" ON public.active_learning_samples FOR ALL TO service_role USING (true) WITH CHECK (true);
END
$$;

INSERT INTO public.schema_migrations (version, description)
VALUES ('202611140002', 'Enable RLS and least-privilege policies on all public tables')
ON CONFLICT (version) DO NOTHING;
