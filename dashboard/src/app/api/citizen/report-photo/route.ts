import { NextResponse } from "next/server";

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

    return NextResponse.json({
      status: "accepted",
      mode: "demo_fallback",
      message: `Anomalia confirmada: ${anomalyType} (${Math.round(confidence * 100)}% confiança) • Gravidade Média • Registado em Av. Marginal (Modo Pré-visualização)`,
      anomaly_id: `CID-${Math.floor(100 + Math.random() * 899)}`,
      anomaly_type: anomalyType,
      confidence,
      coverage_pct: 2.8,
      severity: "Média",
      review_status: "pending_human_review",
      source: "citizen_eu_participo",
      deduplicated: false,
      times_detected: 1,
      street_name: "Av. Marginal",
      lat,
      lng,
    });
  }
}
