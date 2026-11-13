"use client";

import React from "react";
import { Flame, Layers, Radar, SlidersHorizontal, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  THERMAL_METRICS,
  type ThermalCellData,
  type ThermalHeatmapSummary,
  type ThermalMetric,
} from "@/models/thermal-heatmap";
import type { InspectorPanelTab } from "./inspector-panel";

export interface ThermalHeatmapCardProps {
  summary: ThermalHeatmapSummary;
  metric: ThermalMetric;
  onMetricChange: (metric: ThermalMetric) => void;
  resolution?: number;
  onResolutionChange?: (resolution: number) => void;
  radiusPx?: number;
  onRadiusPxChange?: (radiusPx: number) => void;
  intensity?: number;
  onIntensityChange?: (intensity: number) => void;
  hoveredCellIndex?: string | null;
  selectedCell?: ThermalCellData | null;
  onClearSelectedCell?: () => void;
  filtersSummary?: string;
  onEditFilters?: () => void;
  onViewOverview?: () => void;
  onViewAnomalies?: () => void;
  panelOpen?: boolean;
  panelTab?: InspectorPanelTab;
  embedded?: boolean;
  className?: string;
}

export const ThermalHeatmapCard: React.FC<ThermalHeatmapCardProps> = ({
  summary,
  metric,
  onMetricChange,
  radiusPx = 42,
  onRadiusPxChange,
  intensity = 0.85,
  onIntensityChange,
  onViewAnomalies,
  embedded = false,
  className,
}) => {
  const activeDef = THERMAL_METRICS.find((m) => m.id === metric) ?? THERMAL_METRICS[0];
  const totalAnomalies = React.useMemo(
    () => summary.cells.reduce((acc, c) => acc + c.count, 0),
    [summary.cells],
  );

  const hotspots = React.useMemo(() => {
    const byZone = new Map<string, number>();
    for (const cell of summary.cells) {
      for (const z of cell.subZones) {
        byZone.set(z.name, (byZone.get(z.name) ?? 0) + z.count);
      }
    }
    return [...byZone.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [summary.cells]);

  return (
    <div
      role="region"
      aria-label="Controlos do mapa térmico de densidade de buracos"
      className={cn(
        embedded
          ? "flex flex-col gap-4"
          : "pointer-events-auto flex w-[340px] max-w-full flex-col gap-3.5 rounded-2xl border border-border/80 bg-card/95 p-4 elev-3 enter-arc backdrop-blur-md",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <Flame className="size-4 text-status-critical" />
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Mapa Térmico de Densidade
            </h2>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {totalAnomalies} anomalias mapeadas no Concelho de Loulé
          </p>
        </div>
      </div>

      {/* Continuous Green -> Yellow -> Orange -> Red Scale */}
      <div className="flex flex-col gap-1.5 rounded-xl border border-border/70 bg-muted/35 p-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Espetro de Densidade
          </span>
          <span className="text-[11px] font-semibold text-foreground">
            {activeDef.shortLabel}
          </span>
        </div>

        <div className="h-2.5 w-full rounded-full border border-black/10 bg-gradient-to-r from-[#22c55e] via-[#eab308] via-60%-[#f97316] to-[#dc2626] shadow-inner" />

        <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground">
          <span className="text-emerald-600 dark:text-emerald-400">Disperso (1–2)</span>
          <span className="text-amber-600 dark:text-amber-400">Moderado</span>
          <span className="text-red-600 dark:text-red-400">Foco Crítico</span>
        </div>
      </div>

      {/* Weighting mode */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Ponderação Térmica
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          {THERMAL_METRICS.map((m) => {
            const active = metric === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onMetricChange(m.id)}
                className={cn(
                  "flex h-10 cursor-pointer items-center justify-between rounded-xl border px-2.5 text-left text-xs font-medium transition-colors duration-[var(--dur-fast)]",
                  active
                    ? "border-primary/40 bg-primary/10 text-primary elev-1"
                    : "border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <span className="truncate">{m.shortLabel}</span>
                {active && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">{activeDef.description}</p>
      </div>

      {/* Radius & Intensity Sliders */}
      {(onRadiusPxChange || onIntensityChange) && (
        <div className="space-y-2.5 rounded-xl border border-border/70 bg-muted/25 p-3">
          {onRadiusPxChange && (
            <label className="block space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1 font-medium text-muted-foreground">
                  <Radar className="size-3" /> Raio de Dispersão
                </span>
                <span className="font-mono font-semibold tabular-nums">{radiusPx} px</span>
              </div>
              <input
                type="range"
                min={22}
                max={74}
                step={2}
                value={radiusPx}
                onChange={(e) => onRadiusPxChange(Number(e.target.value))}
                className="w-full cursor-pointer accent-primary"
              />
            </label>
          )}
          {onIntensityChange && (
            <label className="block space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1 font-medium text-muted-foreground">
                  <SlidersHorizontal className="size-3" /> Ganho Térmico
                </span>
                <span className="font-mono font-semibold tabular-nums">{Math.round(intensity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.4}
                max={1.4}
                step={0.05}
                value={intensity}
                onChange={(e) => onIntensityChange(Number(e.target.value))}
                className="w-full cursor-pointer accent-primary"
              />
            </label>
          )}
        </div>
      )}

      {/* Top Hotspot Sectors */}
      {hotspots.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="flex items-center gap-1">
              <TrendingUp className="size-3 text-status-critical" /> Zonas de Maior Densidade
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {hotspots.map(([zone, count]) => (
              <div
                key={zone}
                className="flex items-center justify-between rounded-lg border border-border/60 bg-background/70 px-2.5 py-1.5 text-xs"
              >
                <span className="truncate font-medium text-foreground">{zone}</span>
                <span className="ml-1.5 shrink-0 font-mono text-[11px] font-semibold text-status-critical tabular-nums">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {onViewAnomalies && (
        <Button variant="outline" size="sm" onClick={onViewAnomalies} className="w-full">
          <Layers className="size-3.5" />
          Consultar Lista de Anomalias
        </Button>
      )}
    </div>
  );
};
