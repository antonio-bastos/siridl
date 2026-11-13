/**
 * SIRI-DL Geospatial Anomaly & Sector Assessment Model
 *
 * Road infrastructure anomaly mapping in the Municipality of Loulé
 * (Quarteira, Vilamoura, Loulé, Almancil, Boliqueime).
 *
 * Core metric: `severity_index` (integer `Math.round(area_pct * 100)`, e.g. 2.45% -> 245)
 * derived from YOLOv11 bounding box `area_pct`, `confidence`, and estimated cavity area in cm².
 *
 * Severity bands (`SeverityBand`):
 * - `low` -> **Gravidade Baixa** (bottom quartile, green `--status-good`)
 * - `moderate` -> **Gravidade Média** (middle half, amber `--status-warning`)
 * - `critical` -> **Gravidade Crítica** (top quartile, red-orange `--status-serious`)
 */

export type AnomalyType = "pothole" | "cracking" | "manhole" | "subsidence" | "ravelling";
export type RepairStatus = "pending" | "scheduled" | "in_progress" | "repaired";
export type PatrolUnitKind = "fleet_patrol" | "rsu_truck" | "drone_survey";

export const ANOMALY_TYPE_OPTIONS: { value: AnomalyType; label: string }[] = [
  { value: "pothole", label: "Buraco (Ninho)" },
  { value: "cracking", label: "Fissuração em Pele de Crocodilo" },
  { value: "subsidence", label: "Abatimento de Berma" },
  { value: "manhole", label: "Tampa de Saneamento Abatida" },
  { value: "ravelling", label: "Desagregação Superficial" },
];

export const REPAIR_STATUS_OPTIONS: { value: RepairStatus; label: string }[] = [
  { value: "pending", label: "Pendente de Intervenção" },
  { value: "scheduled", label: "Equipa Agendada" },
  { value: "in_progress", label: "Reparação em Curso" },
  { value: "repaired", label: "Reparado e Verificado" },
];

export const PATROL_UNIT_OPTIONS: { value: PatrolUnitKind; label: string }[] = [
  { value: "fleet_patrol", label: "Viatura de Fiscalização Municipal" },
  { value: "rsu_truck", label: "Frota de Recolha RSU" },
  { value: "drone_survey", label: "Levantamento Aéreo por Drone" },
];

export const labelOf = <T extends string>(
  options: readonly { value: T; label: string }[],
  value: T | undefined | null,
): string => options.find((o) => o.value === value)?.label ?? value ?? "";

export const isMunicipalPatrol = (patrolUnit?: string | null): boolean => {
  if (!patrolUnit) return false;
  const norm = patrolUnit.toLowerCase();
  return norm.includes("câmara municipal") || norm.includes("loulé") || norm.includes("siri");
};

export const ROAD_CLASS_ORDER = ["EN125", "EM527", "Av. Marginal", "Urb. Arterial", "Rua Local"];

export interface YoloBoundingBox {
  confidence: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
  area_pct: number;
  label?: string;
}

export interface RoadAnomaly {
  id: number;
  reference: string;
  source: "yolov11" | "patrol" | "rsu" | "field";
  title: string;
  anomaly_type: AnomalyType;
  repair_status: RepairStatus;
  /** Number of individual potholes/cracks detected in the frame */
  detection_count: number;
  /** Number of patrol passes that confirmed this anomaly */
  patrol_passes: number;
  /** Road hierarchy class ("EN125", "EM527", "Av. Marginal", "Urb. Arterial", "Rua Local") */
  road_class: string;
  /** Estimated defect surface area in cm² */
  cavity_area_cm2: number;
  /** Road lane width affected in cm */
  lane_width_cm: number;
  district: string;
  city: string;
  locality: string;
  street: string;
  latitude: number;
  longitude: number;
  /** Patrol unit identifier, e.g. "Viatura Fiscalização #04" */
  patrol_unit: string;
  patrol_kind: PatrolUnitKind;
  first_seen_at: string;
  last_seen_at: string;
  /** YOLOv11 primary detection metadata */
  confidence: number;
  area_pct: number;
  depth_cm: number;
  speed_ms: { preprocess: number; inference: number; postprocess: number };
  image_url: string;
  image_width: number;
  image_height: number;
  detections: YoloBoundingBox[];
  /** Multi-pass severity progression history */
  severity_history: { at: string; area_pct: number; confidence: number; before?: boolean }[];
}

export const MIN_SAMPLE = 3;

export type SeverityBand = "low" | "moderate" | "critical";

export const SEVERITY_BANDS: SeverityBand[] = ["low", "moderate", "critical"];

export const SEVERITY_LABEL: Record<SeverityBand, string> = {
  low: "Gravidade Baixa",
  moderate: "Gravidade Média",
  critical: "Gravidade Crítica",
};

export const SEVERITY_SHORT: Record<SeverityBand, string> = {
  low: "Baixa",
  moderate: "Média",
  critical: "Crítica",
};

export const SEVERITY_HINT: Record<SeverityBand, string> = {
  low: "Desgaste superficial (< 0,8% do enquadramento) — acompanhar em patrulha de rotina.",
  moderate: "Cavidade moderada (0,8% – 2,0% do enquadramento) — agendar reparação preventiva.",
  critical: "Buraco estrutural crítico (> 2,0% do enquadramento) — despacho prioritário em 48h.",
};

export interface Quartiles {
  count: number;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
}

const quantile = (sorted: number[], q: number) => {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round((sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)) * 100) / 100;
};

export const quartilesOf = (values: number[]): Quartiles | null => {
  const sorted = [...values].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  return {
    count: sorted.length,
    min: sorted[0],
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
    max: sorted[sorted.length - 1],
  };
};

export const severityBandOf = (severityIndex: number, q: Quartiles): SeverityBand =>
  severityIndex < q.p25 ? "low" : severityIndex > q.p75 ? "critical" : "moderate";

export const quartileDialPosition = (
  severityIndex: number,
  q: { min: number; p25: number; p75: number; max: number },
) => {
  const lerp = (v: number, a: number, b: number, from: number, to: number) =>
    b > a ? from + ((v - a) / (b - a)) * (to - from) : (from + to) / 2;
  const position =
    severityIndex < q.p25
      ? lerp(severityIndex, q.min, q.p25, -1, -1 / 3)
      : severityIndex <= q.p75
        ? lerp(severityIndex, q.p25, q.p75, -1 / 3, 1 / 3)
        : lerp(severityIndex, q.p75, q.max, 1 / 3, 1);
  return Math.max(-1, Math.min(1, position));
};

export const severityDialPosition = (severityIndex: number, q: Quartiles) => quartileDialPosition(severityIndex, q);

export interface AssessedAnomaly extends RoadAnomaly {
  surface_cm2: number;
  days_open: number;
  /** Severity Index (`Math.round(area_pct * 100)`, e.g. 2.45% -> 245) */
  severity_index?: number;
  severity?: SeverityBand;
}

export type TelemetryReliability = "high" | "medium" | "low";

export const TELEMETRY_RELIABILITY_LABEL: Record<TelemetryReliability, string> = {
  high: "Fiabilidade de telemetria elevada",
  medium: "Fiabilidade de telemetria moderada",
  low: "Amostra setorial reduzida",
};

const reliabilityOf = (q: Quartiles): { level: TelemetryReliability; spread: number } => {
  const spread = q.median > 0 ? (q.p75 - q.p25) / q.median : 1;
  const level: TelemetryReliability =
    q.count < 6 || spread > 0.7 ? "low" : q.count >= 12 && spread <= 0.48 ? "high" : "medium";
  return { level, spread };
};

export interface ResolutionStats {
  count: number;
  days: number | null;
}

export interface RoadClassShare {
  roadClass: string;
  count: number;
  median: number | null;
}

export interface SectorAssessment {
  rows: AssessedAnomaly[];
  excluded: AssessedAnomaly[];
  quartiles: Quartiles | null;
  measured: number;
  counts: Record<SeverityBand, number>;
  resolvedBySeverity: Record<SeverityBand, ResolutionStats>;
  reliability: { level: TelemetryReliability; spread: number } | null;
  roadClassMix: RoadClassShare[];
  mixedTypes: boolean;
  enough: boolean;
  resolutions: {
    severity_index: number;
    days: number;
    severity: SeverityBand;
    first_seen_at: string;
    last_seen_at: string;
  }[];
}

export const assessSector = (
  all: RoadAnomaly[],
  repairedPool: RoadAnomaly[] = [],
  leftOut?: ReadonlySet<number> | unknown,
): SectorAssessment => {
  const leftOutSet: ReadonlySet<number> | undefined =
    leftOut instanceof Set
      ? (leftOut as ReadonlySet<number>)
      : Array.isArray(leftOut)
        ? new Set(
            leftOut.map((item) =>
              typeof item === "object" && item !== null && "id" in item ? Number((item as { id: unknown }).id) : Number(item),
            ),
          )
        : undefined;
  const pool = Array.isArray(repairedPool) ? repairedPool : [];
  const anomalies = leftOutSet?.size ? all.filter((row) => !leftOutSet.has(row.id)) : all;
  const types = new Set(anomalies.map((row) => row.anomaly_type));
  const now = Date.now();

  const measure = (row: RoadAnomaly): AssessedAnomaly => {
    const surface_cm2 = Math.max(1, Math.round(row.cavity_area_cm2));
    const days_open = Math.max(0, Math.floor((now - new Date(row.first_seen_at).getTime()) / 86_400_000));
    const severity_index = Math.round(row.area_pct * 100);
    return { ...row, surface_cm2, days_open, severity_index };
  };

  const measuredRows = anomalies.map(measure);
  const excluded: AssessedAnomaly[] = leftOutSet?.size
    ? all.filter((row) => leftOutSet.has(row.id)).map(measure)
    : [];
  const counted = measuredRows.filter(
    (row): row is AssessedAnomaly & { severity_index: number } => row.severity_index !== undefined,
  );
  const enough = counted.length >= MIN_SAMPLE;
  const quartiles = enough ? quartilesOf(counted.map((row) => row.severity_index)) : null;

  const rows: AssessedAnomaly[] = measuredRows
    .map((row) => ({
      ...row,
      severity: quartiles && row.severity_index !== undefined ? severityBandOf(row.severity_index, quartiles) : undefined,
    }))
    .sort((a, b) => (b.severity_index ?? 0) - (a.severity_index ?? 0));

  const counts: Record<SeverityBand, number> = { low: 0, moderate: 0, critical: 0 };
  for (const row of rows) if (row.severity) counts[row.severity] += 1;

  const medianOf = (values: number[]) => quartilesOf(values)?.median ?? null;

  const resolutions = quartiles
    ? pool.flatMap((row) => {
        const severity_index = Math.round(row.area_pct * 100);
        const days = Math.max(
          1,
          Math.floor((new Date(row.last_seen_at).getTime() - new Date(row.first_seen_at).getTime()) / 86_400_000),
        );
        return [
          {
            severity_index,
            severity: severityBandOf(severity_index, quartiles),
            days,
            first_seen_at: row.first_seen_at,
            last_seen_at: row.last_seen_at,
          },
        ];
      })
    : [];

  const resolvedBySeverity = Object.fromEntries(
    SEVERITY_BANDS.map((band) => {
      const inBand = resolutions.filter((item) => item.severity === band).map((item) => item.days);
      const days = medianOf(inBand);
      return [band, { count: inBand.length, days: days === null ? null : Math.round(days) }];
    }),
  ) as Record<SeverityBand, ResolutionStats>;

  const roadClassMix = ROAD_CLASS_ORDER.map((roadClass) => {
    const subset = measuredRows.filter((row) => row.road_class === roadClass);
    const indices = subset.flatMap((row) => (row.severity_index !== undefined ? [row.severity_index] : []));
    const median = medianOf(indices);
    return { roadClass, count: subset.length, median: median === null ? null : Math.round(median) };
  }).filter((t) => t.count > 0);

  return {
    rows,
    excluded,
    quartiles,
    measured: counted.length,
    counts,
    resolvedBySeverity,
    reliability: quartiles ? reliabilityOf(quartiles) : null,
    roadClassMix,
    mixedTypes: types.size > 1,
    enough,
    resolutions,
  };
};

export const daysOpenLabel = (days: number) =>
  days === 0 ? "detetado hoje" : days === 1 ? "há 1 dia" : `há ${groupedNumber(days)} dias`;

const countedOf = (rows: AssessedAnomaly[], roadClass?: string) =>
  rows.filter(
    (row): row is AssessedAnomaly & { severity_index: number; severity: SeverityBand } =>
      row.severity_index !== undefined && row.severity !== undefined && (!roadClass || row.road_class === roadClass),
  );

export const roadClassQuartiles = (rows: AssessedAnomaly[], roadClass: string) => {
  const own = countedOf(rows, roadClass);
  return { count: own.length, quartiles: own.length >= MIN_SAMPLE ? quartilesOf(own.map((row) => row.severity_index)) : null };
};

const SIZE_BANDS = [0.25, 0.45];
const MAX_SIMILAR = 5;

export const similarAnomaliesFor = (rows: AssessedAnomaly[], surfaceCm2: number, roadClass?: string) => {
  const pool = countedOf(rows, roadClass).filter((row) => row.surface_cm2 > 0);
  const near = (band: number) => pool.filter((row) => Math.abs(row.surface_cm2 - surfaceCm2) <= surfaceCm2 * band);
  const found = near(SIZE_BANDS[0]).length >= MIN_SAMPLE ? near(SIZE_BANDS[0]) : near(SIZE_BANDS[1]);
  return found.sort((a, b) => Math.abs(a.surface_cm2 - surfaceCm2) - Math.abs(b.surface_cm2 - surfaceCm2)).slice(0, MAX_SIMILAR);
};

/* ------------------------------------------------------------------ */
/* Spatial selection geometry                                          */
/* ------------------------------------------------------------------ */

export type SectorSelection =
  | { kind: "circle"; lat: number; lng: number; radiusM: number }
  | { kind: "rect"; south: number; west: number; north: number; east: number }
  | { kind: "polygon"; points: [number, number][] };

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

const RADIUS_MIN_M = 100;
const RADIUS_MAX_M = 50_000;
const RADIUS_STEP_M = 100;
export const RADIUS_WARN_M = 3500;
export const WIDEN_RADIUS_M = 2500;
export const DEFAULT_RADIUS_M = 1400;

export const clampRadius = (m: number) =>
  Math.min(RADIUS_MAX_M, Math.max(RADIUS_MIN_M, Math.round(m / RADIUS_STEP_M) * RADIUS_STEP_M));

export const radiusLabel = (m: number) => (m >= 1000 ? `${m / 1000} km` : `${m} m`);

const EARTH_RADIUS_M = 6_371_000;
const M_PER_DEG_LAT = 111_320;

export const haversineM = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
};

export const selectionBounds = (selection: SectorSelection): Bounds => {
  if (selection.kind === "rect") return selection;
  if (selection.kind === "polygon") {
    const lats = selection.points.map(([lat]) => lat);
    const lngs = selection.points.map(([, lng]) => lng);
    return { south: Math.min(...lats), west: Math.min(...lngs), north: Math.max(...lats), east: Math.max(...lngs) };
  }
  const dLat = selection.radiusM / M_PER_DEG_LAT;
  const dLng = selection.radiusM / (M_PER_DEG_LAT * Math.cos((selection.lat * Math.PI) / 180));
  return { south: selection.lat - dLat, west: selection.lng - dLng, north: selection.lat + dLat, east: selection.lng + dLng };
};

const inPolygon = (lat: number, lng: number, points: [number, number][]) => {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [latI, lngI] = points[i];
    const [latJ, lngJ] = points[j];
    if (latI > lat !== latJ > lat && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI) inside = !inside;
  }
  return inside;
};

export const inSelection = (row: Pick<RoadAnomaly, "latitude" | "longitude">, selection: SectorSelection) =>
  selection.kind === "circle"
    ? haversineM(selection.lat, selection.lng, row.latitude, row.longitude) <= selection.radiusM
    : selection.kind === "polygon"
      ? inPolygon(row.latitude, row.longitude, selection.points)
      : row.latitude >= selection.south && row.latitude <= selection.north && row.longitude >= selection.west && row.longitude <= selection.east;

const flatten = (points: [number, number][]) => {
  const midLat = ((points.reduce((sum, [lat]) => sum + lat, 0) / points.length) * Math.PI) / 180;
  const [lat0, lng0] = points[0];
  return points.map(([lat, lng]) => [(lng - lng0) * M_PER_DEG_LAT * Math.cos(midLat), (lat - lat0) * M_PER_DEG_LAT] as const);
};

const polygonAreaM2 = (points: [number, number][]) => {
  const xy = flatten(points);
  let twice = 0;
  for (let i = 0; i < xy.length; i++) {
    const [x0, y0] = xy[i];
    const [x1, y1] = xy[(i + 1) % xy.length];
    twice += x0 * y1 - x1 * y0;
  }
  return Math.abs(twice) / 2;
};

const segmentsCross = (
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
  d: readonly [number, number],
) => {
  const side = (p: readonly [number, number], q: readonly [number, number], r: readonly [number, number]) =>
    Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
};

export const tidyCorners = (points: [number, number][]): [number, number][] => {
  const n = points.length;
  let crossed = false;
  for (let i = 0; i < n && !crossed; i++) {
    for (let j = i + 2; j < n && !crossed; j++) {
      if (i === 0 && j === n - 1) continue;
      crossed = segmentsCross(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n]);
    }
  }
  if (!crossed) return points;
  const lat = points.reduce((sum, [la]) => sum + la, 0) / n;
  const lng = points.reduce((sum, [, ln]) => sum + ln, 0) / n;
  return [...points].sort((a, b) => Math.atan2(a[0] - lat, a[1] - lng) - Math.atan2(b[0] - lat, b[1] - lng));
};

const selectionAreaKm2 = (selection: SectorSelection) => {
  if (selection.kind === "circle") return (Math.PI * selection.radiusM ** 2) / 1e6;
  if (selection.kind === "polygon") return polygonAreaM2(selection.points) / 1e6;
  const height = (selection.north - selection.south) * M_PER_DEG_LAT;
  const midLat = ((selection.north + selection.south) / 2) * (Math.PI / 180);
  const width = (selection.east - selection.west) * M_PER_DEG_LAT * Math.cos(midLat);
  return (height * width) / 1e6;
};

export const selectionLabel = (selection: SectorSelection) => {
  if (selection.kind === "circle") return `${radiusLabel(selection.radiusM)} em redor do ponto`;
  const km2 = selectionAreaKm2(selection);
  return `Setor delimitado, ${km2 < 10 ? km2.toFixed(1) : Math.round(km2)} km²`;
};

export const selectionKey = (selection: SectorSelection | null) =>
  selection === null
    ? ""
    : selection.kind === "circle"
      ? `c:${selection.lat.toFixed(5)},${selection.lng.toFixed(5)},${selection.radiusM}`
      : selection.kind === "polygon"
        ? `p:${selection.points.map(([lat, lng]) => `${lat.toFixed(5)},${lng.toFixed(5)}`).join(",")}`
        : `r:${selection.south.toFixed(5)},${selection.west.toFixed(5)},${selection.north.toFixed(5)},${selection.east.toFixed(5)}`;

export const parseSelectionKey = (key: string | null | undefined): SectorSelection | null => {
  if (!key) return null;
  const [kind, body] = key.split(":");
  const parts = (body ?? "").split(",").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  if (kind === "c" && parts.length === 3) {
    const [lat, lng, radiusM] = parts;
    return radiusM > 0 ? { kind: "circle", lat, lng, radiusM: clampRadius(radiusM) } : null;
  }
  if (kind === "r" && parts.length === 4) {
    const [south, west, north, east] = parts;
    return north > south && east > west ? { kind: "rect", south, west, north, east } : null;
  }
  if (kind === "p" && parts.length >= 6 && parts.length % 2 === 0) {
    const points = Array.from({ length: parts.length / 2 }, (_, i) => [parts[2 * i], parts[2 * i + 1]] as [number, number]);
    return points.every(([lat]) => Math.abs(lat) <= 90) && polygonAreaM2(points) > 0 ? { kind: "polygon", points } : null;
  }
  return null;
};

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

export const PATROL_PASS_MINIMUMS = [1, 2, 3, 4];
export const DETECTED_WITHIN_DAYS = [7, 30, 90];

export interface AnomalyFilters {
  types: AnomalyType[];
  roadClasses: string[];
  statuses: RepairStatus[];
  patrolKinds: PatrolUnitKind[];
  areaMin?: number;
  areaMax?: number;
  confidenceMin?: number;
  confidenceMax?: number;
  passesMin?: number;
  detectedWithinDays?: number;
}

export const EMPTY_ANOMALY_FILTERS: AnomalyFilters = {
  types: [],
  roadClasses: [],
  statuses: [],
  patrolKinds: [],
};

export const anomalyFiltersKey = (f: AnomalyFilters) =>
  [
    f.types.join(","),
    f.roadClasses.join(","),
    f.statuses.join(","),
    f.patrolKinds.join(","),
    f.areaMin ?? "",
    f.areaMax ?? "",
    f.confidenceMin ?? "",
    f.confidenceMax ?? "",
    f.passesMin ?? "",
    f.detectedWithinDays ?? "",
  ].join("|");

const DAY_MS = 86_400_000;

export type AnomalyPoint = Pick<
  RoadAnomaly,
  | "id"
  | "latitude"
  | "longitude"
  | "anomaly_type"
  | "road_class"
  | "repair_status"
  | "patrol_kind"
  | "cavity_area_cm2"
  | "area_pct"
  | "depth_cm"
  | "confidence"
  | "detection_count"
  | "patrol_passes"
  | "first_seen_at"
  | "patrol_unit"
  | "locality"
  | "city"
  | "street"
  | "severity_history"
> & {
  severity_index?: number;
};

const within = (value: number, min?: number, max?: number) =>
  (min === undefined || value >= min) && (max === undefined || value <= max);

export const matchesAnomalyFilters = (
  row: Pick<
    RoadAnomaly,
    | "anomaly_type"
    | "repair_status"
    | "patrol_kind"
    | "road_class"
    | "cavity_area_cm2"
    | "confidence"
    | "patrol_passes"
    | "first_seen_at"
  >,
  f: AnomalyFilters,
  now = Date.now(),
) =>
  (!f.types.length || f.types.includes(row.anomaly_type)) &&
  (!f.statuses.length || f.statuses.includes(row.repair_status)) &&
  (!f.patrolKinds.length || f.patrolKinds.includes(row.patrol_kind)) &&
  (!f.roadClasses.length || f.roadClasses.includes(row.road_class)) &&
  within(row.cavity_area_cm2, f.areaMin, f.areaMax) &&
  within(Math.round(row.confidence * 100), f.confidenceMin, f.confidenceMax) &&
  (f.passesMin === undefined || row.patrol_passes >= f.passesMin) &&
  (f.detectedWithinDays === undefined || Date.parse(row.first_seen_at) >= now - f.detectedWithinDays * DAY_MS);

export type AnomalyFilterGroup =
  | "types"
  | "roadClasses"
  | "statuses"
  | "area"
  | "confidence"
  | "passes"
  | "patrolKinds"
  | "detected";

const GROUP_CLEARED: Record<AnomalyFilterGroup, Partial<AnomalyFilters>> = {
  types: { types: [] },
  roadClasses: { roadClasses: [] },
  statuses: { statuses: [] },
  area: { areaMin: undefined, areaMax: undefined },
  confidence: { confidenceMin: undefined, confidenceMax: undefined },
  passes: { passesMin: undefined },
  patrolKinds: { patrolKinds: [] },
  detected: { detectedWithinDays: undefined },
};

export const clearFilterGroup = (f: AnomalyFilters, group: AnomalyFilterGroup): AnomalyFilters => ({
  ...f,
  ...GROUP_CLEARED[group],
});

export const groupedNumber = (n: number, options?: Intl.NumberFormatOptions) =>
  n.toLocaleString("pt-PT", options);

export const formatAreaPct = (pts: number) => `${(pts / 100).toFixed(2)}%`;

const cm2Label = (n: number) => `${groupedNumber(n)} cm²`;
const confLabel = (n: number) => `${n}%`;

const rangeLabel = (min: number | undefined, max: number | undefined, format: (n: number) => string) =>
  min !== undefined && max !== undefined
    ? `${format(min)}–${format(max)}`
    : min !== undefined
      ? `≥ ${format(min)}`
      : `≤ ${format(max ?? 0)}`;

const listLabel = <T extends string>(options: { value: T; label: string }[], values: T[]) => {
  const labels = options.filter((o) => values.includes(o.value)).map((o) => o.label);
  return labels.length > 2 ? `${labels.slice(0, 2).join(", ")} +${labels.length - 2}` : labels.join(", ");
};

export const activeFilterChips = (f?: AnomalyFilters | null): { group: AnomalyFilterGroup; label: string }[] => {
  if (!f) return [];
  const chips: { group: AnomalyFilterGroup; label: string }[] = [];
  const types = f.types ?? [];
  const roadClasses = f.roadClasses ?? [];
  const statuses = f.statuses ?? [];
  const patrolKinds = f.patrolKinds ?? [];
  if (types.length) chips.push({ group: "types", label: listLabel(ANOMALY_TYPE_OPTIONS, types) });
  if (roadClasses.length) chips.push({ group: "roadClasses", label: roadClasses.join(", ") });
  if (statuses.length) chips.push({ group: "statuses", label: listLabel(REPAIR_STATUS_OPTIONS, statuses) });
  if (f.areaMin !== undefined || f.areaMax !== undefined)
    chips.push({ group: "area", label: `Cavidade ${rangeLabel(f.areaMin, f.areaMax, cm2Label)}` });
  if (f.confidenceMin !== undefined || f.confidenceMax !== undefined)
    chips.push({ group: "confidence", label: `YOLOv11 ${rangeLabel(f.confidenceMin, f.confidenceMax, confLabel)}` });
  if (f.passesMin !== undefined) chips.push({ group: "passes", label: `${f.passesMin}+ passagens` });
  if (patrolKinds.length) chips.push({ group: "patrolKinds", label: listLabel(PATROL_UNIT_OPTIONS, patrolKinds) });
  if (f.detectedWithinDays !== undefined) chips.push({ group: "detected", label: `Detetado · ${f.detectedWithinDays}d` });
  return chips;
};

export const activeFilterCount = (f: AnomalyFilters) => activeFilterChips(f).length;

export const anomalyFiltersSummary = (f: AnomalyFilters) =>
  activeFilterChips(f)
    .map((chip) => chip.label)
    .join(" · ") || "Todas as anomalias";

/* ------------------------------------------------------------------ */
/* URL Hash State                                                      */
/* ------------------------------------------------------------------ */

const PARAM_KEYS = {
  selection: "area",
  radius: "r",
  types: "type",
  roadClasses: "road",
  statuses: "status",
  patrolKinds: "unit",
  areaMin: "amin",
  areaMax: "amax",
  confidenceMin: "cmin",
  confidenceMax: "cmax",
  passesMin: "passes",
  detectedWithinDays: "days",
} as const;

const listParam = <T extends string>(params: URLSearchParams, key: string, options: { value: T }[]) => {
  const known = new Set(options.map((o) => o.value as string));
  return (params.get(key) ?? "")
    .split(",")
    .filter((v) => known.has(v)) as T[];
};

const numberParam = (params: URLSearchParams, key: string) => {
  const n = Number(params.get(key));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

export const anomalyFiltersFromParams = (params: URLSearchParams): AnomalyFilters => ({
  types: listParam(params, PARAM_KEYS.types, ANOMALY_TYPE_OPTIONS),
  roadClasses: listParam(
    params,
    PARAM_KEYS.roadClasses,
    ROAD_CLASS_ORDER.map((value) => ({ value })),
  ),
  statuses: listParam(params, PARAM_KEYS.statuses, REPAIR_STATUS_OPTIONS),
  patrolKinds: listParam(params, PARAM_KEYS.patrolKinds, PATROL_UNIT_OPTIONS),
  areaMin: numberParam(params, PARAM_KEYS.areaMin),
  areaMax: numberParam(params, PARAM_KEYS.areaMax),
  confidenceMin: numberParam(params, PARAM_KEYS.confidenceMin),
  confidenceMax: numberParam(params, PARAM_KEYS.confidenceMax),
  passesMin: numberParam(params, PARAM_KEYS.passesMin),
  detectedWithinDays: numberParam(params, PARAM_KEYS.detectedWithinDays),
});

export type SectorAuditKind = "triage" | "sector";

export const SECTOR_AUDIT_KIND_LABEL: Record<SectorAuditKind, string> = {
  triage: "Triagem de Anomalia",
  sector: "Auditoria de Setor",
};

export interface TriageTarget {
  area_cm2?: number;
  road_class: string;
  lat?: number;
  lng?: number;
  label?: string;
}

export const sectorAuditParams = (
  selection: SectorSelection | null,
  filtersOrRadius?: number | AnomalyFilters,
  auditIdOrFilters?: string | AnomalyFilters | null,
  extra?: { kind?: SectorAuditKind; target?: TriageTarget | null },
) => {
  const params = new URLSearchParams();

  let radiusM = DEFAULT_RADIUS_M;
  let f: AnomalyFilters = EMPTY_ANOMALY_FILTERS;
  let auditId: string | null = null;

  if (typeof filtersOrRadius === "number") {
    radiusM = filtersOrRadius;
    if (auditIdOrFilters && typeof auditIdOrFilters === "object" && !Array.isArray(auditIdOrFilters)) {
      f = auditIdOrFilters as AnomalyFilters;
    }
  } else if (filtersOrRadius && typeof filtersOrRadius === "object") {
    f = filtersOrRadius as AnomalyFilters;
    if (typeof auditIdOrFilters === "string") {
      auditId = auditIdOrFilters;
    }
  }

  if (auditId) {
    params.set("a", auditId);
    return params;
  }

  const key = selectionKey(selection);
  if (key) params.set(PARAM_KEYS.selection, key);
  params.set(PARAM_KEYS.radius, String(radiusM));

  const safeFilters = {
    types: Array.isArray(f?.types) ? f.types : [],
    roadClasses: Array.isArray(f?.roadClasses) ? f.roadClasses : [],
    statuses: Array.isArray(f?.statuses) ? f.statuses : [],
    patrolKinds: Array.isArray(f?.patrolKinds) ? f.patrolKinds : [],
  };

  for (const [name, values] of Object.entries(safeFilters)) {
    if (Array.isArray(values) && values.length > 0) {
      params.set(PARAM_KEYS[name as keyof typeof safeFilters], values.join(","));
    }
  }

  const numbers = ["areaMin", "areaMax", "confidenceMin", "confidenceMax", "passesMin", "detectedWithinDays"] as const;
  for (const name of numbers) {
    if (f && f[name] !== undefined) {
      params.set(PARAM_KEYS[name], String(f[name]));
    }
  }

  if (extra?.kind === "triage") params.set("kind", "triage");
  if (extra?.target) params.set("target", JSON.stringify(extra.target));

  return params;
};

export const sectorAuditFromParams = (params: URLSearchParams) => {
  const selection = parseSelectionKey(params.get(PARAM_KEYS.selection));
  const radius = Number(params.get(PARAM_KEYS.radius));
  return {
    selection,
    radiusM: selection?.kind === "circle" ? selection.radiusM : radius > 0 ? clampRadius(radius) : DEFAULT_RADIUS_M,
    filters: anomalyFiltersFromParams(params),
  };
};

const ANOMALY_PARAM = "p=";

export const selectedAnomalyRefOf = (hash: string): string | null => {
  const part = hash.replace(/^#/, "").split("&").find((p) => p.startsWith(ANOMALY_PARAM));
  return part ? decodeURIComponent(part.slice(ANOMALY_PARAM.length)) || null : null;
};

export const withSelectedAnomalyRef = (hash: string, ref: string | null): string => {
  const parts = hash
    .replace(/^#/, "")
    .split("&")
    .filter((p) => p && !p.startsWith(ANOMALY_PARAM));
  if (ref) parts.push(ANOMALY_PARAM + encodeURIComponent(ref));
  return parts.join("&");
};

export interface SectorSnapshot {
  count: number;
  measured?: number;
  median?: number;
  p25?: number;
  p75?: number;
  at: string;
}

export interface SectorAuditAnomalies {
  excluded: number[];
  added: string[];
  removed?: number[];
}

export interface SectorAudit {
  id: string;
  kind: SectorAuditKind;
  name: string;
  place?: string;
  saved: boolean;
  saved_at: string | null;
  selection: SectorSelection;
  filters: AnomalyFilters;
  target: TriageTarget | null;
  anomalies: SectorAuditAnomalies | null;
  snapshot: SectorSnapshot | null;
  inspectedIds: number[];
  created_at: string;
  updated_at: string;
}

export interface AnomalyByRef {
  id: number;
  reference: string;
  title?: string;
}

export const placeOf = (rows: Pick<RoadAnomaly, "locality" | "city">[]) => {
  const tally = new Map<string, number>();
  for (const row of rows) {
    const name = row.locality || row.city;
    if (name) tally.set(name, (tally.get(name) ?? 0) + 1);
  }
  let best = "";
  let most = 0;
  for (const [name, n] of tally) if (n > most) [best, most] = [name, n];
  return best;
};

export const auditTitle = (a: Pick<SectorAudit, "name" | "place" | "selection">) =>
  a.name || a.place || selectionLabel(a.selection);

/* ------------------------------------------------------------------ */
/* Standing of a single pothole/anomaly against its sector             */
/* ------------------------------------------------------------------ */

type Counted = AssessedAnomaly & { severity_index: number; severity: SeverityBand };

export interface Placed<T extends AssessedAnomaly = AssessedAnomaly> {
  row: T;
  distanceM: number;
}

export interface AnomalyStanding {
  rank?: { at: number; of: number };
  percentile: number | null;
  vsArea?: number;
  roadClass: { count: number; quartiles: Quartiles | null; vs?: number };
  longerShare: number | null;
  neighbours: Placed[];
  local?: { radiusM: number; count: number; median: number };
  sameClassCount?: number;
  trend?: { a: number; b: number; expected: number; off: number };
}

const NEIGHBOURS = 5;
const LOCAL_RADII_M = [300, 600];
const MIN_TREND = 4;

const trendOf = (counted: Counted[]) => {
  const points = counted.filter((r) => r.surface_cm2 > 0).map((r) => [Math.log(r.surface_cm2), r.severity_index] as const);
  if (points.length < MIN_TREND) return null;
  const mx = points.reduce((s, [x]) => s + x, 0) / points.length;
  const my = points.reduce((s, [, y]) => s + y, 0) / points.length;
  const sxx = points.reduce((s, [x]) => s + (x - mx) ** 2, 0);
  if (sxx < 1e-6) return null;
  const b = points.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0) / sxx;
  return { a: my - b * mx, b };
};

export const trendAt = (trend: { a: number; b: number }, surfaceCm2: number) => trend.a + trend.b * Math.log(surfaceCm2);

export const anomalyStanding = (row: AssessedAnomaly, assessment: SectorAssessment): AnomalyStanding => {
  const q = assessment.quartiles;
  const counted = countedOf(assessment.rows);
  const others = assessment.rows.filter((r) => r.id !== row.id);
  const own = row.severity_index;

  const at = own === undefined ? -1 : counted.findIndex((r) => r.id === row.id);
  const percentile =
    own !== undefined && counted.length > 0
      ? Math.round((counted.filter((r) => r.severity_index <= own).length / counted.length) * 100)
      : null;

  const rcq = roadClassQuartiles(assessment.rows, row.road_class);
  const longerShare = others.length ? others.filter((r) => r.days_open < row.days_open).length / others.length : null;

  const placed = others
    .map((r) => ({ row: r, distanceM: haversineM(row.latitude, row.longitude, r.latitude, r.longitude) }))
    .sort((a, b) => a.distanceM - b.distanceM);

  let local: AnomalyStanding["local"];
  for (const radiusM of LOCAL_RADII_M) {
    const near = placed.flatMap((p) => (p.distanceM <= radiusM && p.row.severity_index !== undefined ? [p.row.severity_index] : []));
    const median = quartilesOf(near)?.median;
    if (near.length >= MIN_SAMPLE && median !== undefined) {
      local = { radiusM, count: near.length, median: Math.round(median) };
      break;
    }
  }

  const fit = trendOf(counted);
  const expected = fit && row.surface_cm2 > 0 ? trendAt(fit, row.surface_cm2) : undefined;
  const trend =
    fit && expected !== undefined && expected > 0 && own !== undefined
      ? { ...fit, expected: Math.round(expected), off: own / expected - 1 }
      : undefined;

  return {
    rank: at >= 0 ? { at: at + 1, of: counted.length } : undefined,
    percentile,
    vsArea: q && own !== undefined ? own / q.median - 1 : undefined,
    roadClass: { ...rcq, vs: rcq.quartiles && own !== undefined ? own / rcq.quartiles.median - 1 : undefined },
    longerShare,
    neighbours: placed.slice(0, NEIGHBOURS),
    local,
    sameClassCount: others.filter((r) => r.road_class === row.road_class).length,
    trend,
  };
};

export const distanceLabel = (m: number) =>
  m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(Math.round(m / 100) / 10).toLocaleString("pt-PT")} km`;

export const parseAnomalyRefs = (text: string): string[] =>
  [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((ref) => {
          const digits = ref.replace(/\D/g, "");
          return digits ? digits.padStart(5, "0") : "";
        })
        .filter(Boolean),
    ),
  ].slice(0, 20);

export interface AnomalyFact {
  kind: "coverage" | "size" | "time" | "confidence" | "street" | "history";
  lead: string;
  rest: string;
  weight: number;
}

export const anomalyFacts = (
  row: AssessedAnomaly,
  assessment: SectorAssessment,
  standing: AnomalyStanding,
): AnomalyFact[] => {
  const facts: AnomalyFact[] = [];
  const add = (kind: AnomalyFact["kind"], weight: number, lead: string, rest: string) =>
    facts.push({ kind, weight, lead, rest });
  const own = row.severity_index;
  const counted = countedOf(assessment.rows);

  if (own !== undefined && counted.length >= MIN_SAMPLE) {
    const worst = counted.every((r) => r.id === row.id || r.severity_index <= own);
    const mildest = counted.every((r) => r.id === row.id || r.severity_index >= own);
    if (worst)
      add(
        "coverage",
        95,
        "Maior cobertura no enquadramento",
        ` entre as ${counted.length} anomalias do concelho (${row.area_pct.toFixed(2)}% da imagem).`,
      );
    else if (mildest)
      add(
        "coverage",
        80,
        "Menor extensão superficial",
        ` entre as ${counted.length} anomalias do concelho (${row.area_pct.toFixed(2)}% da imagem).`,
      );
  }

  if (row.confidence >= 0.9) {
    add(
      "confidence",
      90,
      `${(row.confidence * 100).toFixed(1)}% de confiança YOLOv11`,
      ` — validado em ${row.patrol_passes} passagens independentes de patrulha.`,
    );
  }

  if (row.depth_cm >= 7) {
    add(
      "size",
      86,
      `Profundidade estimada de ${row.depth_cm.toFixed(1)} cm`,
      ` em ${row.road_class} (área de ${groupedNumber(row.cavity_area_cm2)} cm²).`,
    );
  }

  if (row.days_open >= 14 && row.repair_status === "pending") {
    add(
      "time",
      82,
      `Aberto há ${row.days_open} dias sem despacho`,
      ` — ultrapassa o SLA municipal de 7 dias em ${row.locality}.`,
    );
  } else if (row.days_open <= 3) {
    add(
      "time",
      68,
      "Anomalia recém-detetada",
      `: registada por ${row.patrol_unit} ${row.days_open === 0 ? "hoje" : `há ${row.days_open}d`}.`,
    );
  }

  const nearest = standing.neighbours[0];
  if (nearest) {
    add(
      "street",
      64,
      `Anomalia mais próxima a ${distanceLabel(nearest.distanceM)}`,
      ` em ${nearest.row.street} (${nearest.row.area_pct.toFixed(2)}% do enquadramento).`,
    );
  }

  if (row.severity_history.length > 1) {
    const first = row.severity_history[0];
    const growth = ((row.area_pct - first.area_pct) / Math.max(0.1, first.area_pct)) * 100;
    if (growth > 8) {
      add(
        "history",
        88,
        `Expansão de +${Math.round(growth)}% ao longo de ${row.severity_history.length} passagens`,
        ` (de ${first.area_pct.toFixed(2)}% para ${row.area_pct.toFixed(2)}% do enquadramento).`,
      );
    }
  }

  return facts.sort((a, b) => b.weight - a.weight).slice(0, 6);
};
