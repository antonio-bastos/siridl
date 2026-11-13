"use client";

import React from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import type { AnomalyPoint } from "@/models/road-anomalies";
import type {
  ThermalCellData,
  ThermalHeatmapSummary,
  ThermalMetric,
} from "@/models/thermal-heatmap";

export interface ThermalHeatmapLayerProps {
  summary: ThermalHeatmapSummary;
  points?: AnomalyPoint[];
  metric: ThermalMetric;
  radiusPx?: number;
  intensity?: number;
  hoveredCellIndex: string | null;
  onHoverCell: (h3Index: string | null) => void;
  selectedCellIndex: string | null;
  onSelectCell: (cell: ThermalCellData) => void;
  onClearCell?: () => void;
  padLeft?: number;
}

/**
 * 256-entry RGBA lookup table: Green -> Yellow -> Orange -> Red
 */
function buildThermalPalette(): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 1;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0.0, "rgba(34, 197, 94, 0)");
  grad.addColorStop(0.18, "rgba(34, 197, 94, 0.72)");
  grad.addColorStop(0.42, "rgba(234, 179, 8, 0.85)");
  grad.addColorStop(0.7, "rgba(249, 115, 22, 0.92)");
  grad.addColorStop(0.9, "rgba(239, 68, 68, 0.96)");
  grad.addColorStop(1.0, "rgba(185, 28, 28, 1)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 1);
  return ctx.getImageData(0, 0, 256, 1).data;
}

function pointWeight(p: AnomalyPoint, metric: ThermalMetric): number {
  switch (metric) {
    case "avg_severity":
      return Math.min(1, Math.max(0.35, (p.area_pct ?? 1.5) / 3.5));
    case "degrading":
      return p.repair_status === "pending" || (p.detection_count ?? 1) >= 3 ? 1.0 : 0.4;
    case "scheduled":
      return p.repair_status === "scheduled" || p.repair_status === "in_progress" ? 1.0 : 0.35;
    case "anomaly_count":
    default:
      return 0.65;
  }
}

class ThermalHeatmapCanvasLayer extends L.Layer {
  private canvas: HTMLCanvasElement | null = null;
  private palette: Uint8ClampedArray | null = null;
  private points: AnomalyPoint[] = [];
  private metric: ThermalMetric = "anomaly_count";
  private radiusPx = 42;
  private intensity = 1.0;

  constructor(
    points: AnomalyPoint[],
    metric: ThermalMetric,
    radiusPx = 42,
    intensity = 1.0,
  ) {
    super();
    this.points = points;
    this.metric = metric;
    this.radiusPx = radiusPx;
    this.intensity = intensity;
  }

  updateData(points: AnomalyPoint[], metric: ThermalMetric, radiusPx: number, intensity: number) {
    this.points = points;
    this.metric = metric;
    this.radiusPx = radiusPx;
    this.intensity = intensity;
    this.redraw();
  }

  onAdd(map: L.Map): this {
    if (!this.palette) {
      this.palette = buildThermalPalette();
    }
    const pane = map.getPane("overlayPane");
    if (!pane) return this;

    const canvas = L.DomUtil.create("canvas", "leaflet-heatmap-layer leaflet-zoom-animated") as HTMLCanvasElement;
    canvas.style.pointerEvents = "none";
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.zIndex = "410";
    this.canvas = canvas;
    pane.appendChild(canvas);

    map.on("moveend zoomend viewreset resize", this.redraw, this);
    this.redraw();
    return this;
  }

  onRemove(map: L.Map): this {
    map.off("moveend zoomend viewreset resize", this.redraw, this);
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    this.canvas = null;
    return this;
  }

  redraw = () => {
    const map = this._map;
    const canvas = this.canvas;
    const palette = this.palette;
    if (!map || !canvas || !palette) return;

    const size = map.getSize();
    if (size.x <= 0 || size.y <= 0) return;

    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(canvas, topLeft);

    canvas.width = Math.round(size.x);
    canvas.height = Math.round(size.y);
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (this.points.length === 0) return;

    const zoom = map.getZoom();
    const zoomFactor = Math.max(0.75, Math.min(1.65, (zoom - 9) * 0.16 + 0.8));
    const r = Math.max(18, Math.round(this.radiusPx * zoomFactor));

    const brush = document.createElement("canvas");
    brush.width = r * 2;
    brush.height = r * 2;
    const bCtx = brush.getContext("2d")!;
    const grad = bCtx.createRadialGradient(r, r, r * 0.1, r, r, r);
    grad.addColorStop(0, "rgba(0, 0, 0, 1)");
    grad.addColorStop(0.55, "rgba(0, 0, 0, 0.45)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    bCtx.fillStyle = grad;
    bCtx.fillRect(0, 0, r * 2, r * 2);

    for (const pt of this.points) {
      const cp = map.latLngToContainerPoint([pt.latitude, pt.longitude]);
      if (cp.x < -r || cp.y < -r || cp.x > size.x + r || cp.y > size.y + r) continue;
      const w = pointWeight(pt, this.metric) * this.intensity;
      ctx.globalAlpha = Math.min(1, Math.max(0.18, w));
      ctx.drawImage(brush, Math.round(cp.x - r), Math.round(cp.y - r));
    }

    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha === 0) continue;
      const idx = alpha * 4;
      data[i] = palette[idx]!;
      data[i + 1] = palette[idx + 1]!;
      data[i + 2] = palette[idx + 2]!;
      data[i + 3] = Math.min(220, Math.round(palette[idx + 3]! * 0.92));
    }
    ctx.putImageData(img, 0, 0);
  };
}

export const ThermalHeatmapLayer: React.FC<ThermalHeatmapLayerProps> = ({
  summary,
  points,
  metric,
  radiusPx = 42,
  intensity = 0.85,
}) => {
  const map = useMap();
  const layerRef = React.useRef<ThermalHeatmapCanvasLayer | null>(null);

  const allPoints = React.useMemo<AnomalyPoint[]>(() => {
    if (points && points.length > 0) return points;
    return summary.cells.flatMap((c) => c.anomalies);
  }, [points, summary.cells]);

  React.useEffect(() => {
    const layer = new ThermalHeatmapCanvasLayer(allPoints, metric, radiusPx, intensity);
    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      layer.removeFrom(map);
      layerRef.current = null;
    };
  }, [map]);

  React.useEffect(() => {
    layerRef.current?.updateData(allPoints, metric, radiusPx, intensity);
  }, [allPoints, metric, radiusPx, intensity]);

  return null;
};
