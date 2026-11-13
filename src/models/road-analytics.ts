import { haversineM, type AssessedAnomaly } from "@/models/road-anomalies";

export interface RoadSummary {
  key: string;
  name: string;
  locality: string;
  roadClass: string;
  count: number;
  pendingCount: number;
  scheduledCount: number;
  inProgressCount: number;
  repairedCount: number;
  criticalCount: number;
  avgDepthCm: number;
  avgAreaPct: number;
  centroid: [number, number];
  rows: AssessedAnomaly[];
}

export interface RoadInspection {
  lat: number;
  lng: number;
  roadName: string;
  locality?: string;
  loading: boolean;
  fromReverseGeocode: boolean;
  issues: AssessedAnomaly[];
}

const stripAccents = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const extractRoadDisplayName = (street: string): string => {
  const beforeComma = street.split(",")[0]?.trim() ?? street.trim();
  return beforeComma || street.trim();
};

export const normalizeRoadKey = (raw: string): string => {
  let s = stripAccents(extractRoadDisplayName(raw)).toLowerCase();
  s = s
    .replace(/\bav\.?\s+/g, "avenida ")
    .replace(/\br\.?\s+/g, "rua ")
    .replace(/\bcam\.?\s+/g, "caminho ")
    .replace(/\bdr\.?\s+/g, "doutor ")
    .replace(/\beng\.?\s+/g, "engenheiro ")
    .replace(/\bestrada nacional\s*/g, "en")
    .replace(/\ben\s+(\d+)/g, "en$1")
    .replace(/\bestrada municipal\s*/g, "em")
    .replace(/\bem\s+(\d+)/g, "em$1")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return s;
};

export const roadsMatch = (a: string, b: string): boolean => {
  const ka = normalizeRoadKey(a);
  const kb = normalizeRoadKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  if (ka.length >= 5 && kb.includes(ka)) return true;
  if (kb.length >= 5 && ka.includes(kb)) return true;
  return false;
};

export const groupIssuesByRoad = (rows: readonly AssessedAnomaly[]): RoadSummary[] => {
  const map = new Map<string, { name: string; locality: string; roadClass: string; rows: AssessedAnomaly[] }>();

  for (const row of rows) {
    const displayName = extractRoadDisplayName(row.street);
    const key = normalizeRoadKey(displayName);
    if (!key) continue;
    const entry = map.get(key);
    if (entry) {
      entry.rows.push(row);
    } else {
      map.set(key, {
        name: displayName,
        locality: row.locality || row.city,
        roadClass: row.road_class,
        rows: [row],
      });
    }
  }

  const summaries: RoadSummary[] = [];
  for (const [key, entry] of map) {
    const count = entry.rows.length;
    const pendingCount = entry.rows.filter((r) => r.repair_status === "pending").length;
    const scheduledCount = entry.rows.filter((r) => r.repair_status === "scheduled").length;
    const inProgressCount = entry.rows.filter((r) => r.repair_status === "in_progress").length;
    const repairedCount = entry.rows.filter((r) => r.repair_status === "repaired").length;
    const criticalCount = entry.rows.filter((r) => r.severity === "critical" || r.area_pct >= 2.2).length;
    const avgDepthCm = entry.rows.reduce((sum, r) => sum + r.depth_cm, 0) / count;
    const avgAreaPct = entry.rows.reduce((sum, r) => sum + r.area_pct, 0) / count;
    const lat = entry.rows.reduce((sum, r) => sum + r.latitude, 0) / count;
    const lng = entry.rows.reduce((sum, r) => sum + r.longitude, 0) / count;

    summaries.push({
      key,
      name: entry.name,
      locality: entry.locality,
      roadClass: entry.roadClass,
      count,
      pendingCount,
      scheduledCount,
      inProgressCount,
      repairedCount,
      criticalCount,
      avgDepthCm,
      avgAreaPct,
      centroid: [lat, lng],
      rows: [...entry.rows].sort((a, b) => b.area_pct - a.area_pct),
    });
  }

  return summaries.sort((a, b) => b.count - a.count || b.avgAreaPct - a.avgAreaPct);
};

export const findNearestRoadAtPoint = (
  lat: number,
  lng: number,
  rows: readonly AssessedAnomaly[],
  maxDistanceM = 80,
): { roadName: string; locality: string; issues: AssessedAnomaly[]; distanceM: number } | null => {
  let closest: { row: AssessedAnomaly; d: number } | null = null;
  for (const row of rows) {
    const d = haversineM(lat, lng, row.latitude, row.longitude);
    if (d <= maxDistanceM && (!closest || d < closest.d)) {
      closest = { row, d };
    }
  }
  if (!closest) return null;
  const roadName = extractRoadDisplayName(closest.row.street);
  const issues = rows.filter((r) => roadsMatch(r.street, roadName));
  return {
    roadName,
    locality: closest.row.locality || closest.row.city,
    issues: issues.length > 0 ? issues : [closest.row],
    distanceM: closest.d,
  };
};

export const matchIssuesForRoadName = (roadName: string, rows: readonly AssessedAnomaly[]): AssessedAnomaly[] =>
  rows.filter((r) => roadsMatch(r.street, roadName) || roadsMatch(r.road_class, roadName));
