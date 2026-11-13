"use client";

import React from "react";
import { Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/reui/badge";
import { useLatestCallback } from "@/hooks/use-latest-callback";
import {
  ANOMALY_TYPE_OPTIONS,
  REPAIR_STATUS_OPTIONS,
  SEVERITY_LABEL,
  SEVERITY_SHORT,
  daysOpenLabel,
  distanceLabel,
  groupedNumber,
  haversineM,
  parseAnomalyRefs,
  selectionBounds,
  type AnomalyByRef,
  type AssessedAnomaly,
  type SectorSelection,
  type SeverityBand,
} from "@/models/road-anomalies";

export const SEVERITY_COLOR_VAR: Record<SeverityBand, string> = {
  low: "var(--status-good)",
  moderate: "var(--status-warning)",
  critical: "var(--status-serious)",
};

export const SeverityPill: React.FC<{ severity: SeverityBand; className?: string }> = ({
  severity,
  className,
}) => (
  <span
    className={cn(
      "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap shadow-2xs",
      className,
    )}
    style={{
      backgroundColor: `color-mix(in oklab, ${SEVERITY_COLOR_VAR[severity]} 15%, var(--card))`,
      color: SEVERITY_COLOR_VAR[severity],
      border: `1px solid color-mix(in oklab, ${SEVERITY_COLOR_VAR[severity]} 30%, transparent)`,
    }}
  >
    {SEVERITY_LABEL[severity]}
  </span>
);

export const listedAnomalies = (
  rows: readonly AssessedAnomaly[],
  excluded: readonly AssessedAnomaly[] = [],
  from?: { lat: number; lng: number } | [number, number] | null,
): { row: AssessedAnomaly; included: boolean; distanceM?: number }[] => {
  const all = [
    ...rows.map((row) => ({ row, included: true })),
    ...excluded.map((row) => ({ row, included: false })),
  ];
  if (!from) return all;
  const lat = Array.isArray(from) ? from[0] : from.lat;
  const lng = Array.isArray(from) ? from[1] : from.lng;
  return all
    .map((item) => ({
      ...item,
      distanceM: haversineM(lat, lng, item.row.latitude, item.row.longitude),
    }))
    .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0));
};

const REUI_BADGE_VARIANT: Record<SeverityBand, "success-light" | "warning-light" | "destructive-light"> = {
  low: "success-light",
  moderate: "warning-light",
  critical: "destructive-light",
};

const typeLabel = (value: AssessedAnomaly["anomaly_type"]) =>
  ANOMALY_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;

const statusLabel = (value: AssessedAnomaly["repair_status"]) =>
  REPAIR_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value;

export interface AnomalyListProps {
  rows: AssessedAnomaly[];
  excluded?: readonly AssessedAnomaly[];
  selection?: SectorSelection;
  from?: { lat: number; lng: number } | [number, number] | null;
  hasSelection?: boolean;
  loading?: boolean;
  hoveredId: number | null;
  onHover: (id: number | null) => void;
  onOpen?: (id: number) => void;
  onSelect?: (id: number) => void;
  onInclude?: (id: number, included: boolean) => void;
  onIncludeAll?: (included: boolean) => void;
  onToggleExcluded?: (id: number) => void;
  onSetAllExcluded?: (excludeAll: boolean) => void;
  added?: readonly AnomalyByRef[];
  addedIds?: ReadonlySet<number>;
  onAdd?: (row: AnomalyByRef) => void;
  onAddRefs?: (refs: string[]) => void;
  onRemoveAdded?: (id: number) => void;
  onLookupRef?: (ref: string) => AnomalyByRef | null;
  filtersSummary?: string;
  onEditFilters?: () => void;
}

const RefSearch: React.FC<{
  onAddRefs: (refs: string[]) => void;
}> = ({ onAddRefs }) => {
  const [text, setText] = React.useState("");
  const parsed = React.useMemo(() => parseAnomalyRefs(text), [text]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed.length) return;
    onAddRefs(parsed);
    setText("");
  };

  return (
    <form onSubmit={submit} className="mb-2.5">
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Adicionar por referência (00117, 00118…)"
          aria-label="Adicionar anomalia por referência"
          className="h-10 w-full rounded-lg border bg-background pr-16 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        {text && (
          <div className="absolute right-1 flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setText("")}
              aria-label="Limpar"
              className="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
            <button
              type="submit"
              disabled={!parsed.length}
              className="inline-flex h-6 items-center gap-1 rounded bg-primary px-2 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
            >
              <Plus className="size-3" />
              Adicionar
            </button>
          </div>
        )}
      </div>
    </form>
  );
};

interface AnomalyRowProps {
  row: AssessedAnomaly;
  included: boolean;
  added: boolean;
  distanceM: number;
  hot: boolean;
  onHover: (id: number | null) => void;
  onSelect: (id: number) => void;
  onToggleExcluded: (id: number) => void;
  onRemoveAdded: (id: number) => void;
}

const AnomalyRow = React.memo<AnomalyRowProps>(function AnomalyRow({
  row,
  included,
  added,
  distanceM,
  hot,
  onHover,
  onSelect,
  onToggleExcluded,
  onRemoveAdded,
}) {
  const box = row.detections[0];
  return (
    <div
      data-anomaly-row={row.id}
      onMouseEnter={() => onHover(row.id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        "group relative flex items-stretch rounded-xl border bg-card transition-[background-color,border-color,box-shadow,opacity] duration-[var(--dur-fast)] ease-[var(--ease-out)] hover:bg-muted/40",
        !included && "opacity-55",
        hot
          ? "border-primary/60 bg-[var(--hover-wash)] shadow-xs"
          : "hover:border-foreground/20 hover:bg-[var(--hover-wash)]",
      )}
    >
      <label
        title={included ? "Incluído nas estatísticas do setor — clique para excluir" : "Excluído das estatísticas do setor — clique para incluir"}
        onClick={(e) => e.stopPropagation()}
        className="flex w-8 shrink-0 cursor-pointer items-center justify-center pl-1.5"
      >
        <Checkbox
          checked={included}
          onCheckedChange={() => onToggleExcluded(row.id)}
          aria-label={`Incluir ${row.title} na análise do setor`}
        />
      </label>

      <button
        type="button"
        onClick={() => onSelect(row.id)}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2.5 pr-3 pl-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className="relative h-14 w-18 shrink-0 overflow-hidden rounded-lg border bg-muted">
          <img
            src={row.image_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
          {box && (
            <svg
              viewBox={`0 0 ${row.image_width} ${row.image_height}`}
              preserveAspectRatio="xMidYMid slice"
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              <rect
                x={box.x1}
                y={box.y1}
                width={box.width}
                height={box.height}
                fill="rgba(239, 68, 68, 0.24)"
                stroke="#ff3b30"
                strokeWidth={22}
                rx={12}
              />
            </svg>
          )}
          <span className="absolute bottom-0.5 left-0.5 rounded bg-black/75 px-1 py-px font-mono text-[9px] font-semibold text-white tabular-nums">
            {(row.confidence * 100).toFixed(0)}%
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <Badge variant="outline" size="xs" className="font-mono uppercase">
                {row.reference}
              </Badge>
              {added && (
                <Badge variant="info-light" size="xs">
                  Adicionado
                </Badge>
              )}
              <span className="truncate text-xs font-semibold text-foreground">{row.street}</span>
            </span>
            <span className="shrink-0 text-xs font-bold tracking-tight tabular-nums">
              {row.area_pct.toFixed(2)}% área
            </span>
          </div>

          <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="truncate">
              {typeLabel(row.anomaly_type)} · {row.road_class} · {groupedNumber(row.cavity_area_cm2)} cm²
            </span>
            <span className="shrink-0 font-medium tabular-nums">Prof. {row.depth_cm} cm</span>
          </div>

          <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="truncate">
              {row.locality} · {distanceLabel(distanceM)} · {daysOpenLabel(row.days_open)}
            </span>
            {included && row.severity ? (
              <Badge variant={REUI_BADGE_VARIANT[row.severity]} size="xs" title={SEVERITY_LABEL[row.severity]}>
                <span aria-hidden className="size-1.5 rounded-full" style={{ background: SEVERITY_COLOR_VAR[row.severity] }} />
                {SEVERITY_SHORT[row.severity]}
              </Badge>
            ) : (
              <span className="text-[10px] text-muted-foreground">{statusLabel(row.repair_status)}</span>
            )}
          </div>
        </div>
      </button>

      {added && (
        <button
          type="button"
          onClick={() => onRemoveAdded(row.id)}
          aria-label={`Remover ${row.reference}`}
          title="Remover anomalia adicionada"
          className="mr-1.5 flex size-6 shrink-0 self-center items-center justify-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
});

export const AnomalyList: React.FC<AnomalyListProps> = ({
  rows,
  excluded = [],
  selection,
  from,
  hoveredId,
  onHover,
  onOpen,
  onSelect,
  onInclude,
  onIncludeAll,
  onToggleExcluded,
  onSetAllExcluded,
  added = [],
  addedIds = new Set(),
  onAddRefs,
  onRemoveAdded,
}) => {
  const hover = useLatestCallback(onHover);
  const select = useLatestCallback(onOpen ?? onSelect ?? (() => {}));
  const toggleExcluded = useLatestCallback((id: number) => {
    if (onInclude) {
      const isCurrentlyIncluded = rows.some((r) => r.id === id);
      onInclude(id, !isCurrentlyIncluded);
    } else if (onToggleExcluded) {
      onToggleExcluded(id);
    }
  });
  const removeAdded = useLatestCallback(onRemoveAdded ?? (() => {}));

  const centre = React.useMemo(() => {
    if (from) {
      return Array.isArray(from) ? from : ([from.lat, from.lng] as const);
    }
    if (selection) {
      if (selection.kind === "circle") return [selection.lat, selection.lng] as const;
      const b = selectionBounds(selection);
      return [(b.north + b.south) / 2, (b.east + b.west) / 2] as const;
    }
    return [37.0697, -8.1006] as const;
  }, [from, selection]);

  const ordered = React.useMemo(() => {
    const all = [
      ...rows.map((row) => ({ row, included: true })),
      ...excluded.map((row) => ({ row, included: false })),
    ];
    return all
      .map((entry) => ({
        ...entry,
        distanceM: haversineM(centre[0], centre[1], entry.row.latitude, entry.row.longitude),
      }))
      .sort((a, b) => a.distanceM - b.distanceM || (b.row.severity_index ?? 0) - (a.row.severity_index ?? 0));
  }, [rows, excluded, centre]);

  const total = ordered.length;
  const allIncluded = excluded.length === 0;
  const noneIncluded = rows.length === 0;

  const handleToggleAll = () => {
    if (onIncludeAll) {
      onIncludeAll(!allIncluded);
    } else if (onSetAllExcluded) {
      onSetAllExcluded(allIncluded);
    }
  };

  const handleAddRefs = (refs: string[]) => {
    onAddRefs?.(refs);
  };

  const activeAddedIds = React.useMemo(() => {
    if (addedIds && addedIds.size > 0) return addedIds;
    return new Set(added.map((a) => a.id));
  }, [addedIds, added]);

  return (
    <div>
      {onAddRefs && <RefSearch onAddRefs={handleAddRefs} />}

      {total === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Sem buracos ou anomalias neste setor. Ajuste os filtros YOLOv11.
        </p>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between gap-2 px-1.5 text-xs text-muted-foreground">
            <label className="inline-flex cursor-pointer items-center gap-2 select-none">
              <Checkbox
                checked={allIncluded ? true : noneIncluded ? false : "indeterminate"}
                onCheckedChange={handleToggleAll}
                aria-label="Incluir todas as anomalias nas estatísticas do setor"
              />
              <span>
                <span className="font-medium text-foreground tabular-nums">{rows.length}</span>
                {excluded.length > 0 && <> de {total}</>} no índice de gravidade
              </span>
            </label>
            <span className="text-[11px]">Mais próximos primeiro</span>
          </div>

          <div className="enter-stagger flex flex-col gap-1.5">
            {ordered.map(({ row, included, distanceM }) => (
              <AnomalyRow
                key={row.id}
                row={row}
                included={included}
                added={activeAddedIds.has(row.id)}
                distanceM={distanceM}
                hot={row.id === hoveredId}
                onHover={hover}
                onSelect={select}
                onToggleExcluded={toggleExcluded}
                onRemoveAdded={removeAdded}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};
