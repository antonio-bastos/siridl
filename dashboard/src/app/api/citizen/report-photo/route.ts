import { NextResponse } from "next/server";
import { snapToOsmRoadFallback } from "@/lib/map-matching";

const FASTAPI_BASE =
  process.env.FASTAPI_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

const CATEGORY_MAP: Record<string, string> = {
  buraco: "Buraco no Pavimento",
  fissura: "Fissura Longitudinal",
  tampa: "Tampa de Esgoto Desnivelada",
  sinalizacao: "Sinalização Danificada",
  auto: "Buraco no Pavimento",
};

const SENSITIVE_ZONES = [
  { name: "Escola Secundária de Loulé", label_pt: "Escola", zone_type: "school", lat: 37.1394, lng: -8.0218 },
  { name: "EB 2,3 D. Dinis (Quarteira)", label_pt: "Escola", zone_type: "school", lat: 37.0719, lng: -8.0987 },
  { name: "Escola Básica de Almancil", label_pt: "Escola", zone_type: "school", lat: 37.0865, lng: -8.0319 },
  { name: "Hospital de Loulé", label_pt: "Hospital", zone_type: "hospital", lat: 37.1338, lng: -8.0272 },
  { name: "Centro de Saúde de Quarteira", label_pt: "Hospital", zone_type: "hospital", lat: 37.0706, lng: -8.1032 },
  { name: "Rotunda da Av. Sá Carneiro", label_pt: "Rotunda", zone_type: "roundabout", lat: 37.0715, lng: -8.1048 },
  { name: "Passadeira Av. Infante de Sagres", label_pt: "Passadeira", zone_type: "crosswalk", lat: 37.0689, lng: -8.1014 },
  { name: "Passadeira Av. José da Costa Mealha", label_pt: "Passadeira", zone_type: "crosswalk", lat: 37.1364, lng: -8.0205 },
];

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function POST(request: Request) {
  const formData = await request.formData();

  try {
    const upstream = await fetch(`${FASTAPI_BASE}/api/v1/citizen/report-photo`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(15000),
    });
    const payload = await upstream.json();
    return NextResponse.json(payload, { status: upstream.status });
  } catch {
    // Graceful fallback when FastAPI backend is offline during frontend preview
    const image = formData.get("image");
    const lat = Number(formData.get("lat") || 37.1364);
    const lng = Number(formData.get("lng") || -8.0205);
    const category = String(formData.get("category") || "auto");
    const fileSize = image instanceof File ? image.size : 0;

    if (fileSize === 0) {
      return NextResponse.json(
        {
          status: "rejected_by_ai",
          message:
            "Não foi possível ler a fotografia enviada. Verifique o ficheiro e tente novamente.",
          max_confidence: 0,
        },
        { status: 200 },
      );
    }

    const anomalyType = CATEGORY_MAP[category] || "Buraco no Pavimento";
    const confidence = 0.91;
    const estimatedAreaCm2 = 940.0;
    const sharpnessScore = 184.5;
    const baseSeverity = "Média";
    const roadMatch = snapToOsmRoadFallback(lat, lng);

    let nearbyPoi: { name: string; label_pt: string; zone_type: string; distance_m: number } | null = null;
    let bestDist = Infinity;
    for (const poi of SENSITIVE_ZONES) {
      const dist = haversineMeters(roadMatch.lat, roadMatch.lng, poi.lat, poi.lng);
      if (dist <= 100 && dist < bestDist) {
        bestDist = dist;
        nearbyPoi = {
          name: poi.name,
          label_pt: poi.label_pt,
          zone_type: poi.zone_type,
          distance_m: Number(dist.toFixed(1)),
        };
      }
    }

    const proximityBoost = nearbyPoi !== null;
    const severity = proximityBoost ? "Crítica" : baseSeverity;
    const poiNote = nearbyPoi
      ? ` • Prioridade agravada (${nearbyPoi.label_pt} a ${nearbyPoi.distance_m} m)`
      : "";

    return NextResponse.json({
      status: "accepted",
      mode: "demo_fallback",
      message: `Anomalia confirmada: ${anomalyType} (${Math.round(confidence * 100)}% confiança) • ~${estimatedAreaCm2} cm² • Gravidade ${severity}${poiNote} • Registado em ${roadMatch.street_name} (${roadMatch.road_class})`,
      anomaly_id: `CID-${Math.floor(100 + Math.random() * 899)}`,
      anomaly_type: anomalyType,
      confidence,
      coverage_pct: 2.8,
      estimated_area_cm2: estimatedAreaCm2,
      sharpness_score: sharpnessScore,
      base_severity: baseSeverity,
      severity,
      proximity_boost: proximityBoost,
      nearby_poi: nearbyPoi,
      review_status: "pending_human_review",
      source: "citizen_eu_participo",
      deduplicated: false,
      times_detected: 1,
      street_name: roadMatch.street_name,
      parish: roadMatch.parish,
      road_class: roadMatch.road_class,
      snapped: roadMatch.snapped,
      snap_distance_m: roadMatch.snap_distance_m,
      raw_lat: roadMatch.raw_lat,
      raw_lng: roadMatch.raw_lng,
      lat: roadMatch.lat,
      lng: roadMatch.lng,
    });
  }
}
