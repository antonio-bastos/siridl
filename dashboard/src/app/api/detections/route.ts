import { NextResponse } from "next/server";
import { listRoadAnomalies } from "@/lib/supabase-server";
import { SIRI_ANOMALIES } from "@/models/siri-potholes";

const REPAIR_STATUS_MAP: Record<string, "pending" | "scheduled" | "in_progress" | "repaired"> = {
  Pendente: "pending",
  Agendado: "scheduled",
  "Em Reparação": "in_progress",
  Resolvido: "repaired",
};

export async function GET() {
  try {
    const rows = await listRoadAnomalies(300);
    const anomalies = rows.map((r) => ({
      id: r.id,
      reference: r.anomaly_code,
      source: r.source || "yolov11",
      title: r.title || `${r.anomaly_type} · ${r.street_name}`,
      anomaly_type: r.anomaly_type === "Buraco no Pavimento" ? "pothole" : r.anomaly_type,
      repair_status: REPAIR_STATUS_MAP[r.repair_status] || "pending",
      detection_count: r.times_detected,
      patrol_passes: r.times_detected,
      road_class: r.road_class || "Rua Local",
      roadnumber: r.roadnumber,
      categoria: r.categoria,
      gestao: r.gestao,
      n_vias: r.n_vias,
      sla_exempt: r.sla_exempt,
      cavity_area_cm2: r.estimated_area_cm2,
      lane_width_cm: 350,
      district: "Faro",
      city: "Loulé",
      locality: r.parish,
      parish: r.parish,
      street: r.street_name,
      latitude: r.lat,
      longitude: r.lng,
      patrol_unit: r.patrol_unit || "Viatura Fiscalização #01",
      patrol_kind: r.patrol_kind || "fleet_patrol",
      first_seen_at: r.created_at,
      last_seen_at: r.updated_at || r.created_at,
      detected_at: r.created_at,
      confidence: r.confidence,
      area_pct: r.coverage_pct,
      severity: r.severity,
      estimated_area_cm2: r.estimated_area_cm2,
      depth_cm: r.profundidade_cm ?? 4.5,
      speed_ms: { preprocess: 1.8, inference: 8.4, postprocess: 1.4 },
      image_url: r.image_url || "/api/media/assets/reference.jpg",
      image_width: 1280,
      image_height: 720,
      bbox: r.bbox,
      bboxes: Array.isArray(r.bbox) ? r.bbox : [],
    }));

    return NextResponse.json({
      source: "supabase_postgresql",
      anomalies,
      model: "SIRI-DL YOLOv11s (Supabase PostGIS + Cloudflare R2)",
    });
  } catch {
    return NextResponse.json({
      source: "fallback_seed",
      anomalies: SIRI_ANOMALIES,
      model: "SIRI-DL YOLOv11s (Offline Seed Fallback)",
    });
  }
}
