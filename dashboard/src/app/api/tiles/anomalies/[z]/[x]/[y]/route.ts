import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL =
  process.env.SIRI_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const { z, x, y } = await context.params;
  const cleanY = y.replace(/\.pbf$/i, "");

  try {
    const upstream = await fetch(
      `${BACKEND_URL}/api/v1/tiles/anomalies/${encodeURIComponent(z)}/${encodeURIComponent(x)}/${encodeURIComponent(cleanY)}.pbf`,
      {
        method: "GET",
        signal: AbortSignal.timeout(5_000),
      },
    );

    if (upstream.status === 204) {
      return new NextResponse(null, {
        status: 204,
        headers: {
          "Cache-Control": "public, max-age=15",
          "X-Tile-Source": upstream.headers.get("X-Tile-Source") ?? "postgis-empty",
        },
      });
    }

    if (!upstream.ok) {
      return new NextResponse(null, {
        status: 204,
        headers: { "X-Tile-Source": "upstream-fallback" },
      });
    }

    const buf = await upstream.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.mapbox-vector-tile",
        "Cache-Control": "public, max-age=15",
        "X-Tile-Source": upstream.headers.get("X-Tile-Source") ?? "postgis-st-asmvt",
      },
    });
  } catch {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Cache-Control": "no-store",
        "X-Tile-Source": "offline-fallback",
      },
    });
  }
}
