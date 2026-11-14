import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getR2Object } from "@/lib/r2-server";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ key: string[] }> },
) {
  const { key } = await context.params;
  const objectKey = key.join("/").replace(/\.\./g, "");
  if (!objectKey) {
    return NextResponse.json({ detail: "Chave de objeto inválida." }, { status: 400 });
  }

  try {
    const r2 = await getR2Object(objectKey);
    if (r2.ok && r2.bytes) {
      return new NextResponse(r2.bytes, {
        status: 200,
        headers: {
          "Content-Type": r2.contentType || "image/jpeg",
          "Cache-Control": "public, max-age=3600",
          "X-Storage-Provider": "cloudflare-r2",
        },
      });
    }
  } catch {
    // Fall back to local public/ if offline
  }

  try {
    const localPath = path.join(process.cwd(), "public", objectKey);
    const bytes = await fs.readFile(localPath);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": objectKey.endsWith(".png") ? "image/png" : "image/jpeg",
        "Cache-Control": "public, max-age=3600",
        "X-Storage-Provider": "local-public-fallback",
      },
    });
  } catch {
    return NextResponse.json({ detail: "Objeto não encontrado." }, { status: 404 });
  }
}
