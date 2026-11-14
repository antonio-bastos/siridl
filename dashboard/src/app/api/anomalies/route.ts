import { NextRequest, NextResponse } from "next/server";
import {
  bulkUpdateRoadAnomalyStatus,
  createRoadAnomaly,
  listRoadAnomalies,
  type DbRoadAnomaly,
} from "@/lib/supabase-server";
import { ENTRADAS_MOCK_DATA, type EntradaAnomalia } from "@/models/entradas-data";

function mapDbToEntrada(row: DbRoadAnomaly): EntradaAnomalia {
  const dt = new Date(row.created_at);
  const label = Number.isNaN(dt.getTime())
    ? row.created_at
    : dt.toLocaleString("pt-PT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

  const bboxRaw = (row.bbox && typeof row.bbox === "object" && !Array.isArray(row.bbox)
    ? row.bbox
    : {}) as Record<string, unknown>;

  return {
    id: row.anomaly_code,
    tipo: (row.anomaly_type as EntradaAnomalia["tipo"]) || "Buraco no Pavimento",
    confianca: Number(row.confidence ?? 0.9),
    rua: row.street_name,
    freguesia: row.parish,
    classificacaoVia: (row.road_class as EntradaAnomalia["classificacaoVia"]) || "Rua Local",
    roadnumber: row.roadnumber ?? undefined,
    categoria: row.categoria ?? undefined,
    nVias: row.n_vias ?? undefined,
    gestao: row.gestao as EntradaAnomalia["gestao"],
    slaExempt: Boolean(row.sla_exempt),
    coberturaPct: Number(row.coverage_pct ?? 1.5),
    profundidadeCm: row.profundidade_cm ?? undefined,
    areaEstimadaM2: Number(((row.estimated_area_cm2 ?? 1200) / 10_000).toFixed(2)),
    areaEstimadaCm2: Number(row.estimated_area_cm2 ?? 1200),
    nitidezScore: row.sharpness_score ?? undefined,
    proximidadeSensivel: row.nearby_poi_name
      ? {
          nome: row.nearby_poi_name,
          tipo: (row.nearby_poi_type as "Escola" | "Hospital" | "Rotunda" | "Passadeira") || "Passadeira",
          distanciaM: Math.round(Number(row.nearby_poi_distance_m ?? 50)),
          gravidadeBase: (row.base_severity as "Baixa" | "Média" | "Crítica") || "Média",
        }
      : undefined,
    estado: row.repair_status,
    ultimaDetecaoIso: row.created_at,
    ultimaDetecaoLabel: label,
    recorrencia: Number(row.times_detected ?? 1),
    lat: Number(row.lat),
    lng: Number(row.lng),
    viatura: row.patrol_unit || "Viatura Fiscalização #01",
    imagemUrl: row.image_url || "/api/media/assets/reference.jpg",
    thumbPosition: "50% 50%",
    bbox: {
      xPct: Number(bboxRaw.xPct ?? 35),
      yPct: Number(bboxRaw.yPct ?? 45),
      wPct: Number(bboxRaw.wPct ?? 30),
      hPct: Number(bboxRaw.hPct ?? 22),
      className: String(bboxRaw.className ?? "pothole"),
    },
    notas: row.description ?? undefined,
  };
}

export async function GET() {
  try {
    const rows = await listRoadAnomalies(500);
    return NextResponse.json({
      source: "supabase_postgresql",
      count: rows.length,
      entradas: rows.map(mapDbToEntrada),
    });
  } catch (err) {
    return NextResponse.json(
      {
        source: "fallback_seed",
        count: ENTRADAS_MOCK_DATA.length,
        entradas: ENTRADAS_MOCK_DATA,
        warning: err instanceof Error ? err.message : "Supabase indisponível",
      },
      { status: 200 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const created = await createRoadAnomaly({
      anomaly_code: String(body.id || `ANM-${Date.now().toString().slice(-5)}`),
      anomaly_type: String(body.tipo || "Buraco no Pavimento"),
      confidence: Number(body.confianca ?? 1.0),
      coverage_pct: Number(body.coberturaPct ?? 1.5),
      estimated_area_cm2: Number(body.areaEstimadaCm2 ?? 1500),
      profundidade_cm: typeof body.profundidadeCm === "number" ? body.profundidadeCm : null,
      severity: body.gravidade ?? "Média",
      source: "manual_office",
      repair_status: body.estado ?? "Pendente",
      description: body.notas ?? null,
      street_name: String(body.rua || "Via Municipal (Loulé)"),
      parish: String(body.freguesia || "Loulé"),
      road_class: String(body.classificacaoVia || "Rua Local"),
      patrol_unit: String(body.viatura || "Registo Manual (Obras Públicas)"),
      lat: Number(body.lat),
      lng: Number(body.lng),
      bbox: body.bbox,
    });
    return NextResponse.json({ status: "ok", entrada: mapDbToEntrada(created) }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Erro ao guardar anomalia." },
      { status: 400 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    const estado = body.estado as "Pendente" | "Agendado" | "Em Reparação" | "Resolvido";
    const updated = await bulkUpdateRoadAnomalyStatus(ids, estado);
    return NextResponse.json({ status: "ok", updatedCount: updated.length });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Erro ao atualizar registos." },
      { status: 400 },
    );
  }
}
