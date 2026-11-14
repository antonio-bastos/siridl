"use client";

import React from "react";
import dynamic from "next/dynamic";
import { Flame, MapPin, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  EMPTY_ANOMALY_FILTERS,
  activeFilterCount,
  anomalyFiltersSummary,
  assessSector,
  inSelection,
  matchesAnomalyFilters,
  selectionBounds,
  type AnomalyFilterGroup,
  type AnomalyFilters,
  type AnomalyPoint,
  type RepairStatus,
  type RoadAnomaly,
  type SectorAudit,
  type SectorSelection,
  type TriageTarget,
  withSelectedAnomalyRef,
} from "@/models/road-anomalies";
import {
  findNearestRoadAtPoint,
  matchIssuesForRoadName,
  type RoadInspection,
  type RoadSummary,
} from "@/models/road-analytics";
import {
  aggregateThermalZones,
  type ThermalCellData,
  type ThermalMetric,
} from "@/models/thermal-heatmap";
import { AnomalyDetail } from "./anomaly-detail";
import { AnomalyFiltersDialog, type LocationPreset } from "./anomaly-filters-dialog";
import { AnomalyList } from "./anomaly-list";
import { AnomalyMap, type RoadMarkerPin } from "./anomaly-map";
import {
  InspectorPanel,
  type InspectorPanelTab,
  inspectorPanelCover,
  useInspectorPanelWidth,
} from "./inspector-panel";
import type { MapCover } from "./map-view";
import { RoadExplorer } from "./road-explorer";
import { SeverityOverview } from "./severity-overview";
import { ThermalHeatmapCard } from "./thermal-heatmap-card";
import type { ThermalHeatmapLayerProps } from "./thermal-heatmap-layer";

const ThermalHeatmapLayer = dynamic<ThermalHeatmapLayerProps>(
  () => import("./thermal-heatmap-layer").then((mod) => mod.ThermalHeatmapLayer),
  { ssr: false },
);

export type WorkspaceMode = "pins" | "heatmap";

export interface AnomalyMapWorkspaceProps {
  initialAnomalies: RoadAnomaly[];
  repairedPool?: RoadAnomaly[];
  initialAudit: SectorAudit;
  initialAnomalyId?: number | null;
  onOpenAnomalyChange?: (anomaly: RoadAnomaly | null) => void;
  onSaveAudit?: (audit: SectorAudit) => Promise<void> | void;
}

const DEFAULT_CENTER: [number, number] = [37.1375, -8.0231];

const toAnomalyPoint = (row: RoadAnomaly): AnomalyPoint => ({
  id: row.id,
  latitude: row.latitude,
  longitude: row.longitude,
  severity_index: Math.round(row.area_pct * 100),
  area_pct: row.area_pct,
  confidence: row.confidence,
  cavity_area_cm2: row.cavity_area_cm2,
  depth_cm: row.depth_cm,
  anomaly_type: row.anomaly_type,
  road_class: row.road_class,
  repair_status: row.repair_status,
  patrol_kind: row.patrol_kind,
  patrol_passes: row.patrol_passes,
  detection_count: row.detection_count,
  first_seen_at: row.first_seen_at,
  patrol_unit: row.patrol_unit,
  locality: row.locality,
  city: row.city,
  street: row.street,
  severity_history: row.severity_history,
});

export const AnomalyMapWorkspace: React.FC<AnomalyMapWorkspaceProps> = ({
  initialAnomalies,
  repairedPool = [],
  initialAudit,
  initialAnomalyId = null,
  onOpenAnomalyChange,
}) => {
  const [anomalies, setAnomalies] = React.useState<RoadAnomaly[]>(initialAnomalies);
  const [statusOverrides, setStatusOverrides] = React.useState<Map<number, RepairStatus>>(() => new Map());
  const [selection, setSelection] = React.useState<SectorSelection>(initialAudit.selection);
  const [filters, setFilters] = React.useState<AnomalyFilters>(
    initialAudit.filters ?? EMPTY_ANOMALY_FILTERS,
  );
  const [locationPreset, setLocationPreset] = React.useState<LocationPreset | null>(null);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [focusGroup, setFocusGroup] = React.useState<AnomalyFilterGroup | null>(null);

  const [workspaceMode, setWorkspaceMode] = React.useState<WorkspaceMode>("pins");
  const [panelOpen, setPanelOpen] = React.useState(true);
  const [panelTab, setPanelTab] = React.useState<InspectorPanelTab>("overview");
  const [panelWidth, setPanelWidth] = useInspectorPanelWidth();

  const [hoveredId, setHoveredId] = React.useState<number | null>(null);
  const [pickedAnomalyId, setPickedAnomalyId] = React.useState<number | null>(initialAnomalyId);
  const [excludedIds, setExcludedIds] = React.useState<Set<number>>(
    () => new Set(initialAudit.anomalies?.excluded ?? []),
  );
  const [focusTarget, setFocusTarget] = React.useState<TriageTarget | null>(initialAudit.target);
  const [fitRevision, setFitRevision] = React.useState(0);

  // Thermal heatmap controls
  const [thermalMetric, setThermalMetric] = React.useState<ThermalMetric>("anomaly_count");
  const [thermalRadiusPx, setThermalRadiusPx] = React.useState(44);
  const [thermalIntensity, setThermalIntensity] = React.useState(0.88);
  const [hoveredCellIndex, setHoveredCellIndex] = React.useState<string | null>(null);
  const [selectedCell, setSelectedCell] = React.useState<ThermalCellData | null>(null);

  // Road click diagnostics
  const [roadInspection, setRoadInspection] = React.useState<RoadInspection | null>(null);
  const roadAbortRef = React.useRef<AbortController | null>(null);

  // Fetch live detections emitted by predict.py / /api/detections
  React.useEffect(() => {
    let active = true;
    fetch("/api/detections")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { anomalies?: RoadAnomaly[] } | null) => {
        if (!active || !data?.anomalies?.length) return;
        setAnomalies((prev) => {
          const seen = new Set(prev.map((a) => a.id));
          const merged = [...prev];
          for (const item of data.anomalies ?? []) {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              merged.push(item);
            }
          }
          return merged;
        });
      })
      .catch(() => {
        // Keep initial seeded telemetry if offline
      });
    return () => {
      active = false;
    };
  }, []);

  // Merge user-updated repair status overrides cleanly
  const effectiveAnomalies = React.useMemo(() => {
    if (statusOverrides.size === 0) return anomalies;
    return anomalies.map((row) => {
      const override = statusOverrides.get(row.id);
      return override ? { ...row, repair_status: override } : row;
    });
  }, [anomalies, statusOverrides]);

  const pointsPool = React.useMemo(
    () => effectiveAnomalies.map(toAnomalyPoint),
    [effectiveAnomalies],
  );

  // Filtered rows inside current geographic selection
  const filteredAnomalies = React.useMemo(
    () =>
      effectiveAnomalies.filter((row) => {
        const pt = toAnomalyPoint(row);
        return inSelection(pt, selection) && matchesAnomalyFilters(pt, filters);
      }),
    [effectiveAnomalies, selection, filters],
  );

  const assessment = React.useMemo(
    () => assessSector(filteredAnomalies, repairedPool, excludedIds),
    [filteredAnomalies, repairedPool, excludedIds],
  );

  const visiblePoints = React.useMemo(
    () => assessment.rows.map(toAnomalyPoint),
    [assessment.rows],
  );

  const thermalSummary = React.useMemo(
    () => aggregateThermalZones(visiblePoints, 8),
    [visiblePoints],
  );

  const pickedRow = React.useMemo(
    () =>
      pickedAnomalyId === null
        ? null
        : assessment.rows.find((r) => r.id === pickedAnomalyId) ??
          assessment.excluded.find((r) => r.id === pickedAnomalyId) ??
          null,
    [pickedAnomalyId, assessment.rows, assessment.excluded],
  );

  // Sync URL hash for deep-linking selected anomaly
  const openAnomaly = React.useCallback(
    (id: number) => {
      setPickedAnomalyId(id);
      setPanelOpen(true);
      const found = effectiveAnomalies.find((a) => a.id === id) ?? null;
      onOpenAnomalyChange?.(found);
      if (typeof window !== "undefined") {
        const nextHash = withSelectedAnomalyRef(window.location.hash, found?.reference ?? null);
        window.history.replaceState(null, "", nextHash ? `#${nextHash}` : window.location.pathname + window.location.search);
      }
    },
    [effectiveAnomalies, onOpenAnomalyChange],
  );

  const closePickedAnomaly = React.useCallback(() => {
    setPickedAnomalyId(null);
    onOpenAnomalyChange?.(null);
    if (typeof window !== "undefined") {
      const nextHash = withSelectedAnomalyRef(window.location.hash, null);
      window.history.replaceState(null, "", nextHash ? `#${nextHash}` : window.location.pathname + window.location.search);
    }
  }, [onOpenAnomalyChange]);

  const toggleExcluded = React.useCallback((id: number) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setAllExcluded = React.useCallback(
    (exclude: boolean) => {
      if (exclude) {
        setExcludedIds(new Set(filteredAnomalies.map((r) => r.id)));
      } else {
        setExcludedIds(new Set());
      }
    },
    [filteredAnomalies],
  );

  const handleUpdateStatus = React.useCallback((id: number, status: RepairStatus) => {
    setStatusOverrides((prev) => {
      const next = new Map(prev);
      next.set(id, status);
      return next;
    });
  }, []);

  // Road click -> nearest road or Nominatim reverse geocode -> open RoadExplorer tab
  const handleRoadClick = React.useCallback(
    (lat: number, lng: number) => {
      roadAbortRef.current?.abort();
      const controller = new AbortController();
      roadAbortRef.current = controller;

      const nearby = findNearestRoadAtPoint(lat, lng, assessment.rows, 95);
      setRoadInspection({
        lat,
        lng,
        roadName: nearby ? nearby.roadName : "A identificar via municipal…",
        locality: nearby?.locality,
        loading: true,
        fromReverseGeocode: false,
        issues: nearby?.issues ?? [],
      });
      setPanelOpen(true);
      setPanelTab("roads");
      if (pickedAnomalyId !== null) setPickedAnomalyId(null);

      fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&addressdetails=1`,
        {
          signal: controller.signal,
          headers: { "Accept-Language": "pt-PT,pt;q=0.9" },
        },
      )
        .then((res) => (res.ok ? res.json() : null))
        .then((geo: { address?: Record<string, string>; name?: string } | null) => {
          if (controller.signal.aborted) return;
          const addr = geo?.address ?? {};
          const resolvedRoad =
            addr.road ||
            addr.pedestrian ||
            addr.residential ||
            addr.highway ||
            geo?.name ||
            nearby?.roadName ||
            `Via local (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
          const resolvedLocality = addr.city || addr.town || addr.village || addr.suburb || nearby?.locality;
          const matched = matchIssuesForRoadName(resolvedRoad, assessment.rows);
          const issues = matched.length > 0 ? matched : (nearby?.issues ?? []);

          setRoadInspection({
            lat,
            lng,
            roadName: resolvedRoad,
            locality: resolvedLocality,
            loading: false,
            fromReverseGeocode: true,
            issues,
          });
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setRoadInspection((prev) =>
            prev
              ? {
                  ...prev,
                  roadName: nearby ? nearby.roadName : `Via em ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
                  loading: false,
                }
              : null,
          );
        });
    },
    [assessment.rows, pickedAnomalyId],
  );

  const handleSelectRoadSummary = React.useCallback((road: RoadSummary) => {
    setRoadInspection({
      lat: road.centroid[0],
      lng: road.centroid[1],
      roadName: road.name,
      locality: road.locality,
      loading: false,
      fromReverseGeocode: false,
      issues: road.rows,
    });
    setSelection((prev) => prev);
    setPanelOpen(true);
    setPanelTab("roads");
  }, []);

  const handleOpenFilters = React.useCallback((group?: AnomalyFilterGroup) => {
    setFocusGroup(group ?? null);
    setFiltersOpen(true);
  }, []);

  const handleApplyFilters = React.useCallback(
    (nextFilters: AnomalyFilters, nextLocation: LocationPreset | null) => {
      setFilters(nextFilters);
      setLocationPreset(nextLocation);
      if (nextLocation) {
        setSelection({
          kind: "circle",
          lat: nextLocation.latitude,
          lng: nextLocation.longitude,
          radiusM: 2200,
        });
        setFitRevision((n) => n + 1);
      } else if (selection.kind === "circle" && selection.radiusM < 20_000) {
        setSelection(initialAudit.selection);
        setFitRevision((n) => n + 1);
      }
      setFiltersOpen(false);
    },
    [initialAudit.selection, selection],
  );

  const handleWidenRadius = React.useCallback((nextRadiusM: number) => {
    setSelection((prev) =>
      prev.kind === "circle" ? { ...prev, radiusM: nextRadiusM } : prev,
    );
    setFitRevision((n) => n + 1);
  }, []);

  const filterCount = activeFilterCount(filters);
  const filtersSummaryText = anomalyFiltersSummary(filters);
  const areaDisplayLabel =
    locationPreset?.label ?? initialAudit.place ?? "Concelho de Loulé";

  const centerPoint = React.useMemo<[number, number]>(() => {
    const b = selectionBounds(selection);
    const lat = (b.south + b.north) / 2;
    const lng = (b.west + b.east) / 2;
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : DEFAULT_CENTER;
  }, [selection]);

  const mapCover = React.useMemo<MapCover>(
    () => ({
      top: 72,
      left: 16,
      right: panelOpen ? inspectorPanelCover(panelWidth) : 16,
      bottom: 24,
    }),
    [panelOpen, panelWidth],
  );

  const roadMarkerPin = React.useMemo<RoadMarkerPin | null>(() => {
    if (!roadInspection) return null;
    return {
      lat: roadInspection.lat,
      lng: roadInspection.lng,
      name: roadInspection.roadName,
      count: roadInspection.issues.length,
    };
  }, [roadInspection]);

  const panelSummary =
    workspaceMode === "heatmap"
      ? `Mapa Térmico · ${assessment.rows.length} anomalias`
      : `${areaDisplayLabel} · ${assessment.rows.length} anomalias`;

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
      {/* Full-bleed Geospatial Map */}
      <AnomalyMap
        center={centerPoint}
        zoom={12}
        cover={mapCover}
        selection={selection}
        points={visiblePoints}
        rows={assessment.rows}
        hoveredId={hoveredId}
        onHover={setHoveredId}
        onSelectPoint={(lat, lng) => handleRoadClick(lat, lng)}
        onOpenAnomaly={openAnomaly}
        showPins={workspaceMode === "pins"}
        fitRevision={fitRevision}
        roadPin={roadMarkerPin}
        onRoadClick={handleRoadClick}
        heatmapSummary={thermalSummary}
      >
        {workspaceMode === "heatmap" && (
          <ThermalHeatmapLayer
            summary={thermalSummary}
            points={visiblePoints}
            metric={thermalMetric}
            radiusPx={thermalRadiusPx}
            intensity={thermalIntensity}
            hoveredCellIndex={hoveredCellIndex}
            onHoverCell={setHoveredCellIndex}
            selectedCellIndex={selectedCell?.h3Index ?? null}
            onSelectCell={(cell) => {
              setSelectedCell(cell);
              setPanelOpen(true);
            }}
            onClearCell={() => setSelectedCell(null)}
          />
        )}
      </AnomalyMap>

      {/* Top-Left Floating Toolbar (Fitts's & Hick's Law: 2 core controls) */}
      <div className="pointer-events-none absolute top-4 left-4 right-4 z-10 flex flex-wrap items-center gap-2.5 sm:right-auto">
        <div className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-border/80 bg-card/95 p-1.5 shadow-lg backdrop-blur-md">
          <SegmentedControl
            value={workspaceMode}
            onChange={(mode) => {
              const next = mode as WorkspaceMode;
              setWorkspaceMode(next);
              setPanelOpen(true);
              if (next === "heatmap" && panelTab !== "overview") {
                setPanelTab("overview");
              }
            }}
            options={[
              {
                value: "pins",
                label: "Pinos em Direto",
                icon: <MapPin className="size-3.5" />,
              },
              {
                value: "heatmap",
                label: "Mapa Térmico",
                icon: <Flame className="size-3.5" />,
              },
            ]}
          />

          <div className="h-5 w-px bg-border/80" />

          <Button
            type="button"
            variant={filterCount > 0 ? "default" : "ghost"}
            size="sm"
            onClick={() => handleOpenFilters()}
            className={cn(
              "h-8 gap-1.5 rounded-xl px-3 text-xs font-medium",
              filterCount === 0 && "text-foreground hover:bg-muted",
            )}
          >
            <SlidersHorizontal className="size-3.5" />
            <span>Filtros</span>
            {filterCount > 0 && (
              <Badge variant="secondary" size="xs" className="ml-0.5 font-mono tabular-nums">
                {filterCount}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* Uniform Right-Side Inspector Panel (shared look/geometry across Pinos & Mapa Térmico) */}
      <InspectorPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        tab={panelTab}
        onTab={setPanelTab}
        count={assessment.rows.length + assessment.excluded.length}
        summary={panelSummary}
        width={panelWidth}
        onWidth={setPanelWidth}
        overviewLabel={workspaceMode === "heatmap" ? "Mapa Térmico" : "Resumo"}
        pick={
          pickedRow
            ? {
                title: `#${pickedRow.reference} · ${pickedRow.street}`,
                onClose: closePickedAnomaly,
                body: (
                  <AnomalyDetail
                    row={pickedRow}
                    assessment={assessment}
                    included={!excludedIds.has(pickedRow.id)}
                    onToggleIncluded={() => toggleExcluded(pickedRow.id)}
                    onBack={closePickedAnomaly}
                    onOpenAnomaly={openAnomaly}
                    onUpdateStatus={handleUpdateStatus}
                  />
                ),
              }
            : null
        }
        overview={
          workspaceMode === "heatmap" ? (
            <ThermalHeatmapCard
              embedded
              summary={thermalSummary}
              metric={thermalMetric}
              onMetricChange={setThermalMetric}
              radiusPx={thermalRadiusPx}
              onRadiusPxChange={setThermalRadiusPx}
              intensity={thermalIntensity}
              onIntensityChange={setThermalIntensity}
              hoveredCellIndex={hoveredCellIndex}
              selectedCell={selectedCell}
              onClearSelectedCell={() => setSelectedCell(null)}
              filtersSummary={filtersSummaryText}
              onEditFilters={() => handleOpenFilters()}
              onViewAnomalies={() => setPanelTab("anomalies")}
              panelOpen={panelOpen}
              panelTab={panelTab}
            />
          ) : (
            <SeverityOverview
              assessment={assessment}
              selection={selection}
              filtersSummary={filtersSummaryText}
              onEditFilters={() => handleOpenFilters()}
              onResetFilters={() => setFilters(EMPTY_ANOMALY_FILTERS)}
              loading={false}
              areaLabel={areaDisplayLabel}
              hoveredId={hoveredId}
              onHover={setHoveredId}
              onOpenAnomaly={openAnomaly}
              onWidenRadius={handleWidenRadius}
              focusTarget={focusTarget}
              onFocusTargetChange={setFocusTarget}
              onReincludeAll={() => setAllExcluded(false)}
            />
          )
        }
        anomalies={
          <AnomalyList
            rows={assessment.rows}
            excluded={assessment.excluded}
            selection={selection}
            from={centerPoint}
            hasSelection
            loading={false}
            hoveredId={hoveredId}
            onHover={setHoveredId}
            onOpen={openAnomaly}
            onSelect={(id) => openAnomaly(id)}
            onInclude={(id) => toggleExcluded(id)}
            onIncludeAll={() => setAllExcluded(false)}
            onToggleExcluded={toggleExcluded}
            onSetAllExcluded={setAllExcluded}
            filtersSummary={filtersSummaryText}
            onEditFilters={() => handleOpenFilters()}
          />
        }
        roads={
          <RoadExplorer
            rows={assessment.rows}
            inspection={roadInspection}
            hoveredId={hoveredId}
            onHover={setHoveredId}
            onOpenIssue={openAnomaly}
            onSelectRoadSummary={handleSelectRoadSummary}
            onClearInspection={() => setRoadInspection(null)}
          />
        }
      />

      {/* Filter Criteria Dialog Overlay */}
      {filtersOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFiltersOpen(false);
          }}
        >
          <AnomalyFiltersDialog
            filters={filters}
            location={locationPreset}
            pool={pointsPool}
            poolLoading={false}
            focusGroup={focusGroup}
            canCancel
            onApply={handleApplyFilters}
            onCancel={() => setFiltersOpen(false)}
          />
        </div>
      )}
    </div>
  );
};
