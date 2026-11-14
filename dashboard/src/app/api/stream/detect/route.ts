import { NextResponse } from "next/server";

const FASTAPI_BASE =
  process.env.FASTAPI_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

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
    if (typeof telemetryRaw === "string") {
      try {
        const parsed = JSON.parse(telemetryRaw);
        if (parsed?.timestamp) timestamp = parsed.timestamp;
      } catch {
        // ignore malformed telemetry in fallback
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
    });
  }
}
