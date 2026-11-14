/**
 * Server-only Supabase PostgREST client & repositories.
 * NEVER import this module from "use client" components.
 */

export interface DbRoadAnomaly {
  id: number;
  anomaly_code: string;
  anomaly_type: string;
  title: string | null;
  confidence: number;
  coverage_pct: number;
  estimated_area_cm2: number;
  profundidade_cm: number | null;
  sharpness_score: number;
  base_severity: "Baixa" | "Média" | "Crítica" | null;
  severity: "Baixa" | "Média" | "Crítica";
  proximity_boost: boolean;
  nearby_poi_name: string | null;
  nearby_poi_type: string | null;
  nearby_poi_distance_m: number | null;
  source: string;
  review_status: string;
  repair_status: "Pendente" | "Agendado" | "Em Reparação" | "Resolvido";
  description: string | null;
  street_name: string;
  parish: string;
  road_class: string;
  roadnumber: string | null;
  categoria: string | null;
  gestao: string;
  n_vias: string | null;
  sla_exempt: boolean;
  snap_distance_m: number;
  raw_lat: number | null;
  raw_lng: number | null;
  lat: number;
  lng: number;
  patrol_unit: string | null;
  patrol_kind: string | null;
  times_detected: number;
  frames_tracked: number;
  primary_asset_id: string | null;
  image_key: string | null;
  image_url: string | null;
  bbox: unknown;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

function getSupabaseServerConfig() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const secretKey = process.env.SUPABASE_SECRET_KEY || "";
  if (!url || !secretKey) {
    throw new Error("Configuração Supabase em falta no servidor (SUPABASE_URL / SUPABASE_SECRET_KEY).");
  }
  return { url, secretKey };
}

async function supabaseRest<T>(
  path: string,
  init: RequestInit & { prefer?: string } = {},
): Promise<T> {
  const { url, secretKey } = getSupabaseServerConfig();
  const headers = new Headers(init.headers);
  headers.set("apikey", secretKey);
  headers.set("Authorization", `Bearer ${secretKey}`);
  headers.set("Content-Type", "application/json");
  if (init.prefer) {
    headers.set("Prefer", init.prefer);
  }

  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`Supabase REST ${res.status}: ${detail}`);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function listRoadAnomalies(limit = 500): Promise<DbRoadAnomaly[]> {
  return supabaseRest<DbRoadAnomaly[]>(
    `road_anomalies?deleted_at=is.null&order=created_at.desc&limit=${limit}`,
    { method: "GET" },
  );
}

export interface CreateRoadAnomalyInput {
  anomaly_code: string;
  anomaly_type: string;
  title?: string;
  confidence?: number;
  coverage_pct?: number;
  estimated_area_cm2?: number;
  profundidade_cm?: number | null;
  severity?: "Baixa" | "Média" | "Crítica";
  source?: string;
  repair_status?: "Pendente" | "Agendado" | "Em Reparação" | "Resolvido";
  description?: string | null;
  street_name: string;
  parish: string;
  road_class: string;
  roadnumber?: string | null;
  categoria?: string | null;
  gestao?: string;
  n_vias?: string | null;
  sla_exempt?: boolean;
  patrol_unit?: string;
  lat: number;
  lng: number;
  image_key?: string | null;
  image_url?: string | null;
  bbox?: unknown;
}

export async function createRoadAnomaly(input: CreateRoadAnomalyInput): Promise<DbRoadAnomaly> {
  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error("Coordenadas GPS inválidas.");
  }

  const payload = {
    anomaly_code: input.anomaly_code,
    anomaly_type: input.anomaly_type,
    title: input.title ?? `${input.anomaly_type} · ${input.street_name}`,
    confidence: input.confidence ?? 1.0,
    coverage_pct: input.coverage_pct ?? 1.5,
    estimated_area_cm2: input.estimated_area_cm2 ?? 1500,
    profundidade_cm: input.profundidade_cm ?? null,
    severity: input.severity ?? "Média",
    source: input.source ?? "manual_office",
    review_status: "approved",
    repair_status: input.repair_status ?? "Pendente",
    description: input.description ?? null,
    street_name: input.street_name,
    parish: input.parish,
    road_class: input.road_class,
    roadnumber: input.roadnumber ?? null,
    categoria: input.categoria ?? null,
    gestao: input.gestao ?? "Câmara Municipal de Loulé",
    n_vias: input.n_vias ?? null,
    sla_exempt: Boolean(input.sla_exempt ?? false),
    patrol_unit: input.patrol_unit ?? "Registo Manual (Obras Públicas)",
    lat,
    lng,
    image_key: input.image_key ?? "assets/reference.jpg",
    image_url: input.image_url ?? "/api/media/assets/reference.jpg",
    bbox: input.bbox ?? { xPct: 35, yPct: 45, wPct: 30, hPct: 22, className: "manual" },
    geom: `SRID=4326;POINT(${lng} ${lat})`,
  };

  const rows = await supabaseRest<DbRoadAnomaly[]>("road_anomalies", {
    method: "POST",
    prefer: "return=representation",
    body: JSON.stringify(payload),
  });
  return rows[0];
}

export async function updateRoadAnomalyStatus(
  anomalyCode: string,
  repairStatus: "Pendente" | "Agendado" | "Em Reparação" | "Resolvido",
): Promise<DbRoadAnomaly | null> {
  const rows = await supabaseRest<DbRoadAnomaly[]>(
    `road_anomalies?anomaly_code=eq.${encodeURIComponent(anomalyCode)}&deleted_at=is.null`,
    {
      method: "PATCH",
      prefer: "return=representation",
      body: JSON.stringify({ repair_status: repairStatus }),
    },
  );
  return rows?.[0] ?? null;
}

export async function bulkUpdateRoadAnomalyStatus(
  anomalyCodes: string[],
  repairStatus: "Pendente" | "Agendado" | "Em Reparação" | "Resolvido",
): Promise<DbRoadAnomaly[]> {
  if (anomalyCodes.length === 0) return [];
  const inFilter = anomalyCodes.map((c) => `"${c.replace(/"/g, "")}"`).join(",");
  return supabaseRest<DbRoadAnomaly[]>(
    `road_anomalies?anomaly_code=in.(${encodeURIComponent(inFilter)})&deleted_at=is.null`,
    {
      method: "PATCH",
      prefer: "return=representation",
      body: JSON.stringify({ repair_status: repairStatus }),
    },
  );
}

export async function softDeleteRoadAnomaly(anomalyCode: string): Promise<boolean> {
  const rows = await supabaseRest<DbRoadAnomaly[]>(
    `road_anomalies?anomaly_code=eq.${encodeURIComponent(anomalyCode)}&deleted_at=is.null`,
    {
      method: "PATCH",
      prefer: "return=representation",
      body: JSON.stringify({ deleted_at: new Date().toISOString() }),
    },
  );
  return Array.isArray(rows) && rows.length > 0;
}
