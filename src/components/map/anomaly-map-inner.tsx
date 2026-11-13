"use client";

import React from "react";
import L from "leaflet";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polygon,
  Rectangle,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { Globe, Layers, LocateFixed, Minus, Plus, Route, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ANOMALY_TYPE_OPTIONS,
  REPAIR_STATUS_OPTIONS,
  SEVERITY_LABEL,
  clampRadius,
  formatAreaPct,
  groupedNumber,
  labelOf,
  radiusLabel,
  selectionBounds,
  type AnomalyPoint,
  type AssessedAnomaly,
  type SectorSelection,
  type SeverityBand,
} from "@/models/road-anomalies";
import type { ThermalHeatmapSummary } from "@/models/thermal-heatmap";
import { AnomalyPopupCard, type PopupCardBadgeTone } from "./anomaly-popup-card";
import { SEVERITY_COLOR_VAR } from "./anomaly-list";
import { FIT_PAD, bringIntoView, type MapCover } from "./map-view";
import { PIN_PANE, PinCanvas, type PinLook } from "./pin-canvas";

export type MapTool = "point" | "area";

export interface RoadMarkerPin {
  lat: number;
  lng: number;
  name: string;
  count: number;
}

export interface AnomalyMapProps {
  center: [number, number];
  zoom?: number;
  cover?: MapCover;
  selection: SectorSelection | null;
  points: AnomalyPoint[];
  rows: AssessedAnomaly[];
  hoveredId: number | null;
  onHover: (id: number | null) => void;
  onSelectPoint: (lat: number, lng: number) => void;
  onSelectArea?: (selection: SectorSelection) => void;
  onOpenAnomaly: (id: number) => void;
  onRadius?: (radiusM: number) => void;
  tool?: MapTool;
  onTool?: (tool: MapTool) => void;
  showPins?: boolean;
  fitRevision?: number;
  roadPin?: RoadMarkerPin | null;
  onRoadClick?: (lat: number, lng: number) => void;
  heatmapSummary?: ThermalHeatmapSummary;
  children?: React.ReactNode;
}

type Basemap = "map" | "satellite";

const BASEMAP_STORAGE_KEY = "siridl:location-basemap";
const DEFAULT_CENTER: [number, number] = [37.1375, -8.0231];

/** Geographic outline of the Concelho de Loulé. */
const LOULE_BOUNDARY: [number, number][] = [
  [37.318, -8.175],
  [37.335, -8.02],
  [37.308, -7.865],
  [37.215, -7.835],
  [37.125, -7.915],
  [37.048, -7.988],
  [37.044, -8.055],
  [37.058, -8.128],
  [37.115, -8.198],
  [37.22, -8.21],
  [37.318, -8.175],
];

const SEVERITY_TONE: Record<SeverityBand, PopupCardBadgeTone> = {
  low: "good",
  moderate: "warning",
  critical: "serious",
};

const readStoredBasemap = (): Basemap => {
  try {
    return window.localStorage.getItem(BASEMAP_STORAGE_KEY) === "satellite" ? "satellite" : "map";
  } catch {
    return "map";
  }
};

const writeStoredBasemap = (basemap: Basemap) => {
  try {
    window.localStorage.setItem(BASEMAP_STORAGE_KEY, basemap);
    window.dispatchEvent(new Event("storage"));
  } catch {
    // ignore storage failures
  }
};

const stopLeafletBubble = (el: HTMLElement | null) => {
  if (!el) return;
  L.DomEvent.disableClickPropagation(el);
  L.DomEvent.disableScrollPropagation(el);
};

/* ------------------------------------------------------------------ */
/* Canvas pin clustering / rendering helpers                           */
/* ------------------------------------------------------------------ */

interface PinCluster {
  key: string;
  lat: number;
  lng: number;
  points: AnomalyPoint[];
  worstSeverity: SeverityBand;
}

const severityRank = (s: SeverityBand): number => (s === "critical" ? 3 : s === "moderate" ? 2 : 1);

const clusterGridDeg = (zoom: number): number => {
  if (zoom >= 15) return 0;
  if (zoom === 14) return 0.0018;
  if (zoom === 13) return 0.0038;
  if (zoom === 12) return 0.0075;
  return 0.015;
};

const buildClusters = (
  points: AnomalyPoint[],
  rowById: Map<number, AssessedAnomaly>,
  zoom: number,
): PinCluster[] => {
  const step = clusterGridDeg(zoom);
  if (step === 0) {
    return points.map((p) => {
      const assessed = rowById.get(p.id);
      const sev: SeverityBand =
        assessed?.severity ?? (p.area_pct >= 2.0 ? "critical" : p.area_pct >= 0.8 ? "moderate" : "low");
      return {
        key: `p-${p.id}`,
        lat: p.latitude,
        lng: p.longitude,
        points: [p],
        worstSeverity: sev,
      };
    });
  }

  const buckets = new Map<string, AnomalyPoint[]>();
  for (const p of points) {
    const gx = Math.round(p.latitude / step);
    const gy = Math.round(p.longitude / step);
    const key = `${gx}:${gy}`;
    const list = buckets.get(key);
    if (list) list.push(p);
    else buckets.set(key, [p]);
  }

  const clusters: PinCluster[] = [];
  for (const [key, group] of buckets) {
    let latSum = 0;
    let lngSum = 0;
    let worst: SeverityBand = "low";
    for (const p of group) {
      latSum += p.latitude;
      lngSum += p.longitude;
      const assessed = rowById.get(p.id);
      const sev: SeverityBand =
        assessed?.severity ?? (p.area_pct >= 2.0 ? "critical" : p.area_pct >= 0.8 ? "moderate" : "low");
      if (severityRank(sev) > severityRank(worst)) worst = sev;
    }
    clusters.push({
      key,
      lat: latSum / group.length,
      lng: lngSum / group.length,
      points: group,
      worstSeverity: worst,
    });
  }
  return clusters;
};

const clusterIcon = (count: number, worst: SeverityBand, hot: boolean) => {
  const color = SEVERITY_COLOR_VAR[worst];
  const size = count >= 15 ? 36 : count >= 5 ? 32 : 28;
  return L.divIcon({
    className: cn("siri-pin-group", hot && "siri-pin-active"),
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span style="width:${size}px;height:${size}px;background:${color};--group-bg:${color};">${count}</span>`,
  });
};

const roadBeaconIcon = (road: RoadMarkerPin) =>
  L.divIcon({
    className: "poi-marker",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<span style="width:34px;height:34px;background:#0f9488;color:#fff;font-weight:700;font-size:12px;">${road.count}</span>`,
  });

/* ------------------------------------------------------------------ */
/* Map Event Bridges & Viewport Controllers                            */
/* ------------------------------------------------------------------ */

const ViewportBridge: React.FC<{
  selection: SectorSelection | null;
  fitRevision: number;
  cover?: MapCover;
  onZoomChange: (zoom: number) => void;
}> = ({ selection, fitRevision, cover, onZoomChange }) => {
  const map = useMap();
  const initialFitDone = React.useRef(false);

  useMapEvents({
    zoomend: () => onZoomChange(map.getZoom()),
  });

  React.useEffect(() => {
    onZoomChange(map.getZoom());
  }, [map, onZoomChange]);

  React.useEffect(() => {
    if (!selection) return;
    if (!initialFitDone.current || fitRevision > 0) {
      initialFitDone.current = true;
      const b = selectionBounds(selection);
      const bounds = L.latLngBounds([b.south, b.west], [b.north, b.east]);
      bringIntoView(map, bounds, cover);
    }
  }, [map, selection, fitRevision, cover]);

  React.useEffect(() => {
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [map]);

  return null;
};

const RoadClickListener: React.FC<{
  enabled: boolean;
  onRoadClick?: (lat: number, lng: number) => void;
}> = ({ enabled, onRoadClick }) => {
  useMapEvents({
    click: (e) => {
      if (!enabled || !onRoadClick) return;
      onRoadClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

const AnomalyPinLayer: React.FC<{
  points: AnomalyPoint[];
  rows: AssessedAnomaly[];
  hoveredId: number | null;
  onHover: (id: number | null) => void;
  onOpenAnomaly: (id: number) => void;
}> = ({ points, rows, hoveredId, onHover, onOpenAnomaly }) => {
  const map = useMap();
  const [zoom, setZoom] = React.useState(() => map.getZoom());
  const renderer = React.useMemo(() => new PinCanvas(), []);

  useMapEvents({
    zoomend: () => setZoom(map.getZoom()),
  });

  const rowById = React.useMemo(() => {
    const m = new Map<number, AssessedAnomaly>();
    for (const r of rows) m.set(r.id, r);
    return m;
  }, [rows]);

  const clusters = React.useMemo(() => buildClusters(points, rowById, zoom), [points, rowById, zoom]);

  return (
    <>
      {clusters.map((cluster) => {
        if (cluster.points.length > 1) {
          const hot = cluster.points.some((p) => p.id === hoveredId);
          return (
            <Marker
              key={cluster.key}
              position={[cluster.lat, cluster.lng]}
              icon={clusterIcon(cluster.points.length, cluster.worstSeverity, hot)}
              eventHandlers={{
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  map.setView([cluster.lat, cluster.lng], Math.min(17, map.getZoom() + 2), { animate: true });
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -14]} className="map-card-tip" opacity={1}>
                <div className="px-3 py-2 text-xs">
                  <div className="font-semibold text-foreground">
                    {cluster.points.length} anomalias nesta zona
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    Clique para ampliar e inspecionar individualmente
                  </div>
                </div>
              </Tooltip>
            </Marker>
          );
        }

        const point = cluster.points[0];
        const row = rowById.get(point.id);
        const severity: SeverityBand =
          row?.severity ?? (point.area_pct >= 2.0 ? "critical" : point.area_pct >= 0.8 ? "moderate" : "low");
        const hot = hoveredId === point.id;
        const pinColor = SEVERITY_COLOR_VAR[severity];
        const pathOptions: L.CircleMarkerOptions & Partial<PinLook> = {
          renderer,
          pane: PIN_PANE,
          radius: 14,
          stroke: false,
          fillOpacity: 1,
          pinColor,
          pinHotColor: pinColor,
          pinHot: hot,
        };

        return (
          <CircleMarker
            key={point.id}
            center={[point.latitude, point.longitude]}
            pathOptions={pathOptions}
            eventHandlers={{
              mouseover: () => onHover(point.id),
              mouseout: () => onHover(null),
              click: (e) => {
                L.DomEvent.stopPropagation(e);
                onOpenAnomaly(point.id);
              },
            }}
          >
            <Tooltip
              direction="top"
              offset={[0, -28]}
              interactive
              className="map-card-tip"
              opacity={1}
            >
              <AnomalyPopupCard
                photo={row?.image_url}
                placeholder="photo"
                badge={{
                  label: SEVERITY_LABEL[severity],
                  tone: SEVERITY_TONE[severity],
                  dot: SEVERITY_COLOR_VAR[severity],
                }}
                reference={row ? `#${row.reference}` : undefined}
                title={row?.title || labelOf(ANOMALY_TYPE_OPTIONS, point.anomaly_type)}
                location={row?.street || labelOf(REPAIR_STATUS_OPTIONS, point.repair_status)}
                place={row ? `${row.locality || row.city} · ${row.road_class}` : undefined}
                coverage={formatAreaPct(point.area_pct)}
                specs={[
                  `${groupedNumber(point.cavity_area_cm2)} cm²`,
                  `${point.depth_cm.toFixed(1)} cm prof.`,
                  `${(point.confidence * 100).toFixed(0)}% YOLO`,
                ]}
                detections={row?.detections}
                imageWidth={row?.image_width}
                imageHeight={row?.image_height}
                confidence={point.confidence}
                action={{
                  label: "Abrir telemetria completa",
                  onClick: () => onOpenAnomaly(point.id),
                }}
              />
            </Tooltip>
          </CircleMarker>
        );
      })}
    </>
  );
};

const MapControlsOverlay: React.FC<{
  basemap: Basemap;
  onBasemapChange: (next: Basemap) => void;
  selection: SectorSelection | null;
  cover?: MapCover;
}> = ({ basemap, onBasemapChange, selection, cover }) => {
  const map = useMap();

  const fitMunicipalBounds = () => {
    if (selection) {
      const b = selectionBounds(selection);
      bringIntoView(map, L.latLngBounds([b.south, b.west], [b.north, b.east]), cover);
    } else {
      map.setView(DEFAULT_CENTER, 12, { animate: true });
    }
  };

  return (
    <div
      ref={stopLeafletBubble}
      className="pointer-events-auto absolute bottom-5 left-4 z-[600] flex flex-col gap-2"
    >
      <div className="flex items-center overflow-hidden rounded-xl border border-border/80 bg-card/95 p-1 shadow-lg backdrop-blur-md">
        <button
          type="button"
          onClick={() => onBasemapChange("map")}
          className={cn(
            "flex h-7 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors",
            basemap === "map" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Layers className="size-3.5" />
          Mapa
        </button>
        <button
          type="button"
          onClick={() => onBasemapChange("satellite")}
          className={cn(
            "flex h-7 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors",
            basemap === "satellite"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Globe className="size-3.5" />
          Satélite
        </button>
      </div>

      <div className="flex w-fit items-center overflow-hidden rounded-xl border border-border/80 bg-card/95 p-1 shadow-lg backdrop-blur-md">
        <button
          type="button"
          aria-label="Ampliar mapa"
          onClick={() => map.zoomIn()}
          className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted"
        >
          <Plus className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Reduzir mapa"
          onClick={() => map.zoomOut()}
          className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted"
        >
          <Minus className="size-4" />
        </button>
        <div className="mx-0.5 h-4 w-px bg-border" />
        <button
          type="button"
          aria-label="Centrar no Concelho de Loulé"
          title="Centrar no Concelho de Loulé"
          onClick={fitMunicipalBounds}
          className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted"
        >
          <LocateFixed className="size-3.5" />
        </button>
      </div>
    </div>
  );
};

export const AnomalyMapInner: React.FC<AnomalyMapProps> = ({
  center,
  zoom = 12,
  cover,
  selection,
  points,
  rows,
  hoveredId,
  onHover,
  onOpenAnomaly,
  showPins = true,
  fitRevision = 0,
  roadPin,
  onRoadClick,
  children,
}) => {
  const [basemap, setBasemap] = React.useState<Basemap>("map");
  const [, setCurrentZoom] = React.useState(zoom);

  React.useEffect(() => {
    setBasemap(readStoredBasemap());
  }, []);

  const handleBasemapChange = (next: Basemap) => {
    setBasemap(next);
    writeStoredBasemap(next);
  };

  const activeRadiusM = selection?.kind === "circle" ? clampRadius(selection.radiusM) : null;

  return (
    <div className="siri-map relative h-full w-full overflow-hidden bg-muted">
      <MapContainer
        center={center ?? DEFAULT_CENTER}
        zoom={zoom}
        zoomControl={false}
        attributionControl={false}
        className="h-full w-full"
      >
        {basemap === "satellite" ? (
          <>
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
          </>
        ) : (
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
        )}

        {/* Municipality of Loulé perimeter outline */}
        <Polygon
          positions={LOULE_BOUNDARY}
          pathOptions={{
            color: "#0f9488",
            weight: 2.25,
            opacity: 0.78,
            dashArray: "6 5",
            fillColor: "#0f9488",
            fillOpacity: basemap === "satellite" ? 0.05 : 0.03,
            interactive: false,
          }}
        />

        {/* Optional sector boundary highlight when inspecting a narrowed custom sector */}
        {selection && selection.kind === "circle" && activeRadiusM !== null && activeRadiusM < 20_000 && (
          <Circle
            center={[selection.lat, selection.lng]}
            radius={activeRadiusM}
            pathOptions={{
              color: "#0f9488",
              weight: 1.8,
              dashArray: "4 4",
              fillColor: "#0f9488",
              fillOpacity: 0.06,
              interactive: false,
            }}
          />
        )}

        {selection && selection.kind === "rect" && (
          <Rectangle
            bounds={[
              [selection.south, selection.west],
              [selection.north, selection.east],
            ]}
            pathOptions={{
              color: "#0f9488",
              weight: 2,
              fillColor: "#0f9488",
              fillOpacity: 0.08,
              interactive: false,
            }}
          />
        )}

        {selection && selection.kind === "polygon" && selection.points.length >= 3 && (
          <Polygon
            positions={selection.points}
            pathOptions={{
              color: "#0f9488",
              weight: 2,
              fillColor: "#0f9488",
              fillOpacity: 0.08,
              interactive: false,
            }}
          />
        )}

        {/* Thermal Heatmap Canvas Layer or additional custom Leaflet overlays */}
        {children}

        {/* Live Telemetry Anomaly Pins */}
        {showPins && (
          <AnomalyPinLayer
            points={points}
            rows={rows}
            hoveredId={hoveredId}
            onHover={onHover}
            onOpenAnomaly={onOpenAnomaly}
          />
        )}

        {/* Clicked Road Diagnostic Pin */}
        {roadPin && (
          <Marker position={[roadPin.lat, roadPin.lng]} icon={roadBeaconIcon(roadPin)}>
            <Tooltip direction="top" offset={[0, -18]} className="map-card-tip" opacity={1}>
              <div className="flex items-center gap-2 px-3 py-2 text-xs">
                <Route className="size-3.5 text-primary" />
                <div>
                  <div className="font-semibold text-foreground">{roadPin.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {roadPin.count} {roadPin.count === 1 ? "anomalia registada" : "anomalias registadas"}
                  </div>
                </div>
              </div>
            </Tooltip>
          </Marker>
        )}

        <ViewportBridge
          selection={selection}
          fitRevision={fitRevision}
          cover={cover}
          onZoomChange={setCurrentZoom}
        />
        <RoadClickListener enabled={!!onRoadClick} onRoadClick={onRoadClick} />
        <MapControlsOverlay
          basemap={basemap}
          onBasemapChange={handleBasemapChange}
          selection={selection}
          cover={cover}
        />
      </MapContainer>

      {/* Subtle status legend bottom-center on desktop when circle selection is active */}
      {activeRadiusM !== null && activeRadiusM < 20_000 && (
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-[500] hidden -translate-x-1/2 items-center gap-1.5 rounded-full border border-border/80 bg-card/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur-md md:flex">
          <ShieldAlert className="size-3 text-primary" />
          Raio de análise: {radiusLabel(activeRadiusM)}
        </div>
      )}
    </div>
  );
};

export default AnomalyMapInner;
