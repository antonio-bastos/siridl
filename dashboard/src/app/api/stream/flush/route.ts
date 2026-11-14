import { NextResponse } from "next/server";

const FASTAPI_BASE =
  process.env.FASTAPI_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

export async function POST(request: Request) {
  let body: { device_id?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = { device_id: "s22u-fleet-01" };
  }

  try {
    const upstream = await fetch(`${FASTAPI_BASE}/api/v1/stream/flush`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const payload = await upstream.json();
    return NextResponse.json(payload, { status: upstream.status });
  } catch {
    return NextResponse.json({
      status: "ok",
      mode: "demo_fallback",
      device_id: body.device_id ?? "s22u-fleet-01",
      flushed_count: 0,
      flushed_tracks: [],
    });
  }
}
