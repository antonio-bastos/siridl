"use client";

import React from "react";
import { CheckCircle2, Clock, MapPin, Navigation, Route, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { REPAIR_STATUS_OPTIONS, type AssessedAnomaly } from "@/models/road-anomalies";
import {
  groupIssuesByRoad,
  type RoadInspection,
  type RoadSummary,
} from "@/models/road-analytics";
import { SEVERITY_COLOR_VAR } from "./anomaly-list";

export interface RoadExplorerProps {
  rows: readonly AssessedAnomaly[];
  inspection: RoadInspection | null;
  hoveredId: number | null;
  onHover: (id: number | null) => void;
  onOpenIssue: (id: number) => void;
  onSelectRoadSummary: (road: RoadSummary) => void;
  onClearInspection: () => void;
}

const statusLabel = (status: AssessedAnomaly["repair_status"]) =>
  REPAIR_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;

export const RoadExplorer: React.FC<RoadExplorerProps> = ({
  rows,
  inspection,
  hoveredId,
  onHover,
  onOpenIssue,
  onSelectRoadSummary,
  onClearInspection,
}) => {
  const [query, setQuery] = React.useState("");
  const roads = React.useMemo(() => groupIssuesByRoad(rows), [rows]);

  const filteredRoads = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roads;
    return roads.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.locality.toLowerCase().includes(q) ||
        r.roadClass.toLowerCase().includes(q),
    );
  }, [roads, query]);

  const issueCount = inspection?.issues.length ?? 0;
  const pendingCount = inspection?.issues.filter((r) => r.repair_status === "pending").length ?? 0;
  const activeCount =
    inspection?.issues.filter((r) => r.repair_status === "scheduled" || r.repair_status === "in_progress").length ?? 0;
  const criticalCount =
    inspection?.issues.filter((r) => r.severity === "critical" || r.area_pct >= 2.2).length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {!inspection ? (
        <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3.5 text-xs">
          <div className="flex items-start gap-2.5">
            <Navigation className="mt-0.5 size-4 shrink-0 text-primary" />
            <div>
              <p className="font-semibold text-foreground">Inspecionar uma via no mapa</p>
              <p className="mt-0.5 leading-relaxed text-muted-foreground">
                Clique em qualquer estrada ou rua diretamente no mapa (ou escolha uma abaixo) para ver quantos buracos e ocorrências existem nessa via.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-primary/40 bg-card p-3.5 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <Route className="size-3.5 shrink-0 text-primary" />
                <span className="text-[10px] font-semibold tracking-wider text-primary uppercase">
                  Via selecionada
                </span>
                {inspection.loading && (
                  <span className="text-[10px] text-muted-foreground">· A identificar…</span>
                )}
              </div>
              <h3 className="mt-1 truncate text-sm font-semibold text-foreground">{inspection.roadName}</h3>
              {inspection.locality && (
                <p className="text-xs text-muted-foreground">{inspection.locality}</p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClearInspection}
              aria-label="Limpar seleção da via"
              title="Limpar seleção"
              className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </Button>
          </div>

          <div className="mt-3 flex items-baseline justify-between rounded-lg border bg-muted/35 px-3 py-2.5">
            <div>
              <span className="text-2xl font-bold tracking-tight tabular-nums text-foreground">
                {issueCount}
              </span>
              <span className="ml-1.5 text-xs font-medium text-muted-foreground">
                {issueCount === 1 ? "buraco / ocorrência registada" : "buracos / ocorrências registadas"}
              </span>
            </div>
            {criticalCount > 0 ? (
              <Badge variant="destructive-light" size="xs">
                {criticalCount} {criticalCount === 1 ? "crítica" : "críticas"}
              </Badge>
            ) : issueCount === 0 && !inspection.loading ? (
              <Badge variant="success-light" size="xs">
                Sem ocorrências
              </Badge>
            ) : null}
          </div>

          {issueCount > 0 ? (
            <>
              <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center">
                <div className="rounded-lg border bg-background px-2 py-1.5">
                  <div className="text-xs font-bold tabular-nums">{pendingCount}</div>
                  <div className="text-[10px] text-muted-foreground">Pendentes</div>
                </div>
                <div className="rounded-lg border bg-background px-2 py-1.5">
                  <div className="text-xs font-bold tabular-nums">{activeCount}</div>
                  <div className="text-[10px] text-muted-foreground">Em curso/agend.</div>
                </div>
                <div className="rounded-lg border bg-background px-2 py-1.5">
                  <div className="text-xs font-bold tabular-nums">
                    {(inspection.issues.reduce((s, r) => s + r.depth_cm, 0) / issueCount).toFixed(1)} cm
                  </div>
                  <div className="text-[10px] text-muted-foreground">Prof. média</div>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-1.5">
                {inspection.issues.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onMouseEnter={() => onHover(item.id)}
                    onMouseLeave={() => onHover(null)}
                    onClick={() => onOpenIssue(item.id)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 rounded-lg border bg-background px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-muted/40",
                      hoveredId === item.id && "border-primary/60 bg-primary/5",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" size="xs" className="font-mono">
                          {item.reference}
                        </Badge>
                        <span className="truncate text-xs font-medium text-foreground">{item.street}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {statusLabel(item.repair_status)} · Prof. {item.depth_cm} cm
                      </p>
                    </div>
                    <span
                      className="shrink-0 font-mono text-xs font-semibold tabular-nums"
                      style={{ color: item.severity ? SEVERITY_COLOR_VAR[item.severity] : undefined }}
                    >
                      {item.area_pct.toFixed(2)}%
                    </span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            !inspection.loading && (
              <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                Nenhuma anomalia rodoviária detetada nesta via com os filtros atuais.
              </p>
            )
          )}
        </div>
      )}

      {/* Searchable directory of roads with reported issues */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Vias com ocorrências ({roads.length})
          </span>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Procurar rua, avenida ou EN125…"
            aria-label="Procurar via"
            className="h-9 pl-8 text-xs"
          />
        </div>

        {filteredRoads.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Nenhuma via corresponde à pesquisa.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filteredRoads.map((road) => {
              const selected =
                inspection && inspection.roadName.toLowerCase() === road.name.toLowerCase();
              return (
                <button
                  key={road.key}
                  type="button"
                  onClick={() => onSelectRoadSummary(road)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2.5 rounded-xl border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-muted/35",
                    selected && "border-primary bg-primary/5",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="size-3.5 shrink-0 text-primary" />
                      <span className="truncate text-xs font-semibold text-foreground">{road.name}</span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {road.locality} · {road.roadClass} · Prof. média {road.avgDepthCm.toFixed(1)} cm
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <Badge variant={road.criticalCount > 0 ? "destructive-light" : "secondary"} size="xs">
                      {road.count} {road.count === 1 ? "ocorrência" : "ocorrências"}
                    </Badge>
                    {road.pendingCount > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Clock className="size-2.5" /> {road.pendingCount} pend.
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
