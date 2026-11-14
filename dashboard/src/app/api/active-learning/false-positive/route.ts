import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.SIRI_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: "Pedido JSON inválido." }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${BACKEND_URL}/api/v1/active-learning/false-positive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch {
    const reason = String(body.reason ?? "shadow");
    const reasonLabels: Record<string, string> = {
      shadow: "Sombra",
      wet_patch: "Mancha Húmida",
      tar_line: "Linha de Alcatrão",
    };
    return NextResponse.json(
      {
        status: "backend_offline",
        detection_id: body.detection_id ?? "unknown",
        reason,
        reason_label_pt: reasonLabels[reason] ?? reason,
        r2_uploaded: false,
        r2_bucket: "siri-dl",
        r2_error: "Backend FastAPI offline — inicie uvicorn api:app para enviar para Cloudflare R2.",
      },
      { status: 503 },
    );
  }
}
