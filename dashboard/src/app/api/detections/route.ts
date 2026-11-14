import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { SIRI_ANOMALIES } from "@/models/siri-potholes";
import type { RoadAnomaly } from "@/models/road-anomalies";

export async function GET() {
  const extra: RoadAnomaly[] = [];
  try {
    const localPred = path.join(process.cwd(), "predictions");
    const parentPred = path.join(process.cwd(), "..", "predictions");
    const predRoot = fs.existsSync(localPred) ? localPred : parentPred;
    if (fs.existsSync(predRoot)) {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name === "detections.json") files.push(full);
        }
      };
      walk(predRoot);

      let nextId = 500;
      for (const file of files) {
        const raw = JSON.parse(fs.readFileSync(file, "utf8"));
        const records = Array.isArray(raw) ? raw : [raw];
        for (const rec of records) {
          if (!rec.detections?.length) continue;
          const top = rec.detections[0];
          const id = nextId++;
          const areaPct = Number(top.area_pct ?? 1.5);
          const conf = Number(top.confidence ?? 0.88);
          extra.push({
            id,
            reference: String(id).padStart(5, "0"),
            source: "yolov11",
            title: `Deteção YOLOv11 em direto — ${path.basename(rec.image || "frame.jpg")}`,
            anomaly_type: "pothole",
            repair_status: "pending",
            detection_count: rec.detections.length,
            patrol_passes: 1,
            road_class: "Urb. Arterial",
            cavity_area_cm2: Math.round(areaPct * 720),
            lane_width_cm: 90,
            district: "Faro",
            city: "Loulé",
            locality: "Quarteira",
            street: "Av. Infante de Sagres (Feed em Direto)",
            latitude: 37.0697 + ((id % 7) - 3) * 0.0012,
            longitude: -8.1006 + ((id % 5) - 2) * 0.0014,
            patrol_unit: "Transmissão YOLOv11 em Direto",
            patrol_kind: "fleet_patrol",
            first_seen_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
            confidence: conf,
            area_pct: areaPct,
            depth_cm: Math.round(areaPct * 2.8 * 10) / 10,
            speed_ms: rec.speed_ms ?? { preprocess: 2.0, inference: 12.1, postprocess: 1.1 },
            image_url: "/assets/reference.jpg",
            image_width: rec.width || 1280,
            image_height: rec.height || 720,
            detections: rec.detections,
            severity_history: [
              {
                at: new Date().toISOString(),
                area_pct: areaPct,
                confidence: conf,
              },
            ],
          });
        }
      }
    }
  } catch {
    // Fallback cleanly to built-in SIRI_ANOMALIES if predictions folder is locked or malformed
  }

  return NextResponse.json({
    anomalies: [...extra, ...SIRI_ANOMALIES],
    model: "SIRI-DL YOLOv11s (mAP@50: 0.775 · Precisão: 81.9% · Abrangência: 71.0%)",
  });
}
