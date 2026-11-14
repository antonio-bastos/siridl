import * as h3 from "h3-js";
import type { AnomalyPoint } from "@/models/road-anomalies";

export type ThermalMetric =
  | "anomaly_count"
  | "avg_severity"
  | "degrading"
  | "scheduled";

export interface ThermalMetricDefinition {
  id: ThermalMetric;
  label: string;
  shortLabel: string;
  description: string;
  unit: string;
  badge: string;
}

export const THERMAL_METRICS: ThermalMetricDefinition[] = [
  {
    id: "anomaly_count",
    label: "Concentração de buracos",
    shortLabel: "Densidade",
    description: "Agrupamento de anomalias detetadas — o vermelho destaca zonas críticas",
    unit: "anomalias",
    badge: "Predefinição",
  },
  {
    id: "avg_severity",
    label: "Gravidade superficial",
    shortLabel: "Gravidade %",
    description: "Ponderado pela área da caixa delimitadora YOLOv11 por zona",
    unit: "%",
    badge: "Gravidade",
  },
  {
    id: "degrading",
    label: "Cavidades em expansão",
    shortLabel: "Em expansão",
    description: "Zonas com buracos que cresceram entre passagens de patrulha",
    unit: "%",
    badge: "Degradação",
  },
  {
    id: "scheduled",
    label: "Agendado / em curso",
    shortLabel: "Agendado",
    description: "Zonas com anomalias já atribuídas a uma equipa de reparação",
    unit: "%",
    badge: "SLA",
  },
];

export interface ThermalSubZoneStat {
  name: string;
  count: number;
  avgSeverity: number;
  degradingCount: number;
  scheduledCount: number;
}

export interface ThermalCellData {
  h3Index: string;
  boundary: [number, number][];
  center: [number, number];
  count: number;
  avgSeverity: number;
  degradingCount: number;
  degradingPct: number;
  scheduledCount: number;
  scheduledPct: number;
  anomalies: AnomalyPoint[];
  subZones: ThermalSubZoneStat[];
  isInterpolated?: boolean;
}

interface MetricStats {
  min: number;
  max: number;
  median: number;
  average: number;
}

export interface ThermalHeatmapSummary {
  cells: ThermalCellData[];
  totalAnomalies: number;
  subZones: ThermalSubZoneStat[];
  resolution: number;
  metricStats: Record<ThermalMetric, MetricStats>;
}

function calculateMedian(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function aggregateThermalZones(points: AnomalyPoint[], resolution = 8): ThermalHeatmapSummary {
  const validPoints = points.filter(
    (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && p.latitude !== 0 && p.longitude !== 0,
  );

  const cellMap = new Map<string, AnomalyPoint[]>();
  const subZoneMap = new Map<
    string,
    { count: number; sevTotal: number; degrading: number; scheduled: number }
  >();

  for (const point of validPoints) {
    const cellIndex = h3.latLngToCell(point.latitude, point.longitude, resolution);
    const existing = cellMap.get(cellIndex);
    if (existing) existing.push(point);
    else cellMap.set(cellIndex, [point]);

    const zoneName = point.locality || point.city || "Concelho de Loulé";
    const zone = subZoneMap.get(zoneName) ?? { count: 0, sevTotal: 0, degrading: 0, scheduled: 0 };
    zone.count += 1;
    zone.sevTotal += Math.round(point.area_pct * 100);
    if (point.severity_history.length > 1 && point.area_pct > point.severity_history[0].area_pct) {
      zone.degrading += 1;
    }
    if (point.repair_status !== "pending") zone.scheduled += 1;
    subZoneMap.set(zoneName, zone);
  }

  const subZones: ThermalSubZoneStat[] = Array.from(subZoneMap.entries())
    .map(([name, stat]) => ({
      name,
      count: stat.count,
      avgSeverity: stat.count > 0 ? Math.round(stat.sevTotal / stat.count) : 0,
      degradingCount: stat.degrading,
      scheduledCount: stat.scheduled,
    }))
    .sort((a, b) => b.count - a.count);

  const cells: ThermalCellData[] = [];

  for (const [h3Index, cellPoints] of cellMap.entries()) {
    const boundary: [number, number][] = h3.cellToBoundary(h3Index).map(([lat, lng]) => [lat, lng]);
    const center = h3.cellToLatLng(h3Index);

    let totalSev = 0;
    let degradingCount = 0;
    let scheduledCount = 0;

    const cellSubZones = new Map<
      string,
      { count: number; sevTotal: number; degrading: number; scheduled: number }
    >();

    for (const p of cellPoints) {
      const sev = Math.round(p.area_pct * 100);
      totalSev += sev;
      const isDegrading = p.severity_history.length > 1 && p.area_pct > p.severity_history[0].area_pct;
      const isScheduled = p.repair_status !== "pending";
      if (isDegrading) degradingCount += 1;
      if (isScheduled) scheduledCount += 1;

      const zName = p.locality || p.city || "Concelho de Loulé";
      const z = cellSubZones.get(zName) ?? { count: 0, sevTotal: 0, degrading: 0, scheduled: 0 };
      z.count += 1;
      z.sevTotal += sev;
      if (isDegrading) z.degrading += 1;
      if (isScheduled) z.scheduled += 1;
      cellSubZones.set(zName, z);
    }

    const count = cellPoints.length;
    const avgSeverity = count > 0 ? Math.round(totalSev / count) : 0;

    cells.push({
      h3Index,
      boundary,
      center,
      count,
      avgSeverity,
      degradingCount,
      degradingPct: count > 0 ? (degradingCount / count) * 100 : 0,
      scheduledCount,
      scheduledPct: count > 0 ? (scheduledCount / count) * 100 : 0,
      anomalies: cellPoints,
      subZones: Array.from(cellSubZones.entries()).map(([name, stat]) => ({
        name,
        count: stat.count,
        avgSeverity: stat.count > 0 ? Math.round(stat.sevTotal / stat.count) : 0,
        degradingCount: stat.degrading,
        scheduledCount: stat.scheduled,
      })),
      isInterpolated: false,
    });
  }

  const getStatsFor = (getter: (c: ThermalCellData) => number): MetricStats => {
    if (!cells.length) return { min: 0, max: 0, median: 0, average: 0 };
    const values = cells.map(getter).filter((v) => Number.isFinite(v));
    if (!values.length) return { min: 0, max: 0, median: 0, average: 0 };
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      median: calculateMedian(values),
      average: Math.round(values.reduce((acc, v) => acc + v, 0) / values.length),
    };
  };

  return {
    cells,
    totalAnomalies: validPoints.length,
    subZones,
    resolution,
    metricStats: {
      anomaly_count: getStatsFor((c) => c.count),
      avg_severity: getStatsFor((c) => c.avgSeverity),
      degrading: getStatsFor((c) => c.degradingPct),
      scheduled: getStatsFor((c) => c.scheduledPct),
    },
  };
}
