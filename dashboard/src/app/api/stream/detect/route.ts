import { NextResponse } from "next/server";
import { snapToOsmRoadFallback } from "@/lib/map-matching";

const FASTAPI_BASE =
  process.env.FASTAPI_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

const SENSITIVE_ZONES = [
  { name: "Escola Secundária de Loulé", label_pt: "Escola", zone_type: "school", lat: 37.1394, lng: -8.0218 },
  { name: "EB 2,3 D. Dinis (Quarteira)", label_pt: "Escola", zone_type: "school", lat: 37.0719, lng: -8.0987 },
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
    const upstream = await fetch(`${FASTAPI_BASE}/api/v1/stream/detect`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(5000),
    });
    const payload = await upstream.json();
    return NextResponse.json(payload, { status: upstream.status });
  } catch {
    const telemetryRaw = formData.get("telemetry");
    let timestamp = new Date().toISOString();
    let lat = 37.07124;
    let lng = -8.10452;

    if (typeof telemetryRaw === "string") {
      try {
        const parsed = JSON.parse(telemetryRaw);
        if (parsed?.timestamp) timestamp = parsed.timestamp;
        if (typeof parsed?.latitude === "number") lat = parsed.latitude;
        if (typeof parsed?.longitude === "number") lng = parsed.longitude;
      } catch {
        // ignore malformed telemetry in fallback
      }
    }

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

    return NextResponse.json({
      status: "ok",
      mode: "demo_fallback",
      timestamp,
      frame_width: 1280,
      frame_height: 720,
      detections: [],
      persisted_count: 0,
      newly_logged_tracks: [],
      nearby_poi: nearbyPoi,
      map_matched: roadMatch,
    });
  }
}
