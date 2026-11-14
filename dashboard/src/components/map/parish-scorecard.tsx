"use client";

import React from "react";
import { ChevronDown, ChevronUp, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RoadAnomaly } from "@/models/road-anomalies";

export interface ParishScorecardProps {
  rows: RoadAnomaly[];
  selectedParish: string;
  onSelectParish?: (parish: string) => void;
}

interface ParishStat {
  parish: string;
  count: number;
  medianAreaPct: number;
  severityLabel: "Baixa" | "Média" | "Crítica";
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export const ParishScorecard: React.FC<ParishScorecardProps> = ({
  rows,
  selectedParish,
  onSelectParish,
}) => {
  const [collapsed, setCollapsed] = React.useState(false);

  const stats = React.useMemo<ParishStat[]>(() => {
    const groups = new Map<string, number[]>();
    for (const row of rows) {
      const parish = row.locality?.trim() || row.city?.trim() || "Loulé";
      const list = groups.get(parish) ?? [];
      list.push(row.area_pct ?? 0);
      groups.set(parish, list);
    }

    return Array.from(groups.entries())
      .map(([parish, areas]) => {
        const med = median(areas);
        const severityLabel: ParishStat["severityLabel"] =
          med >= 2.4 ? "Crítica" : med >= 1.35 ? "Média" : "Baixa";
        return {
          parish,
          count: areas.length,
          medianAreaPct: med,
          severityLabel,
        };
      })
      .sort((a, b) => b.count - a.count || b.medianAreaPct - a.medianAreaPct);
  }, [rows]);

  return (
    <div className="pointer-events-auto w-72 rounded-2xl border border-border/80 bg-card/95 shadow-lg backdrop-blur-md">
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex w-full cursor-pointer items-center justify-between px-3.5 py-2.5 text-left"
      >
        <div className="flex items-center gap-2">
          <MapPin className="size-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">
            Índice por Freguesia
          </span>
          <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
            {stats.length}
          </span>
        </div>
        {collapsed ? (
          <ChevronDown className="size-3.5 text-muted-foreground" />
        ) : (
          <ChevronUp className="size-3.5 text-muted-foreground" />
        )}
      </button>

      {!collapsed && (
        <div className="max-h-56 space-y-1.5 overflow-y-auto border-t border-border/60 px-3 py-2.5">
          {stats.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Sem registos para o filtro atual.
            </p>
          ) : (
            stats.map((st) => {
              const active = selectedParish === st.parish;
              return (
                <button
                  key={st.parish}
                  type="button"
                  onClick={() =>
                    onSelectParish?.(active ? "all" : st.parish)
                  }
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-xs transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted/70 text-foreground",
                  )}
                >
                  <div className="min-w-0 text-left">
                    <div className="truncate font-medium">{st.parish}</div>
                    <div className="text-[10px] text-muted-foreground">
                      Mediana: {st.medianAreaPct.toFixed(2)}% área
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="font-mono text-xs font-semibold tabular-nums">
                      {st.count}
                    </span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold",
                        st.severityLabel === "Crítica"
                          ? "bg-rose-500/15 text-rose-600 dark:text-rose-400"
                          : st.severityLabel === "Média"
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                            : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
                      )}
                    >
                      {st.severityLabel}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
