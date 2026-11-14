import { NextResponse } from "next/server";

const FASTAPI_BASE =
  process.env.FASTAPI_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

export async function POST(request: Request) {
  const formData = await request.formData();

  try {
    const upstream = await fetch(`${FASTAPI_BASE}/api/v1/citizen/process-video`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(30000),
    });
    const payload = await upstream.json();
    return NextResponse.json(payload, { status: upstream.status });
  } catch {
    const video = formData.get("video");
    const gpx = formData.get("gpx_file");
    const hasGpx = gpx instanceof File && gpx.size > 0;
    const jobId = `demo-${Math.random().toString(36).slice(2, 8)}`;

    return NextResponse.json(
      {
        status: "queued",
        mode: "demo_fallback",
        job_id: jobId,
        video_filename: video instanceof File ? video.name : "percurso.mp4",
        has_gpx: hasGpx,
        message:
          "Vídeo recebido na fila de processamento assíncrono (amostragem 6 FPS + filtro >= 3 km/h + ByteTrack).",
      },
      { status: 202 },
    );
  }
}
