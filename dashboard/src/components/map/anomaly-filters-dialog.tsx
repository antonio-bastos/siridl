"use client";

import React from "react";
import { motion } from "motion/react";
import { Check, MapPin, RotateCcw, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  ANOMALY_TYPE_OPTIONS,
  DETECTED_WITHIN_DAYS,
  EMPTY_ANOMALY_FILTERS,
  PATROL_PASS_MINIMUMS,
  PATROL_UNIT_OPTIONS,
  REPAIR_STATUS_OPTIONS,
  ROAD_CLASS_ORDER,
  activeFilterCount,
  clearFilterGroup,
  groupedNumber,
  matchesAnomalyFilters,
  type AnomalyFilterGroup,
  type AnomalyFilters,
  type AnomalyPoint,
  type AnomalyType,
} from "@/models/road-anomalies";

export interface LocationPreset {
  id: string;
  label: string;
  detail: string;
  latitude: number;
  longitude: number;
  street?: string;
}

const PRESET_LOCATIONS: LocationPreset[] = [
  { id: "loc-1", label: "Av. Infante de Sagres", detail: "8125 Quarteira, Loulé", latitude: 37.0675, longitude: -8.1018, street: "Av. Infante de Sagres" },
  { id: "loc-2", label: "Marina de Vilamoura", detail: "8125 Vilamoura, Loulé", latitude: 37.0769, longitude: -8.1165, street: "Av. da Marina" },
  { id: "loc-3", label: "Avenida Tivoli", detail: "8125 Vilamoura, Loulé", latitude: 37.0752, longitude: -8.1112, street: "Avenida Tivoli" },
  { id: "loc-4", label: "Av. José da Costa Mealha", detail: "8100 Loulé Centro", latitude: 37.1389, longitude: -8.0218, street: "Av. José da Costa Mealha" },
  { id: "loc-5", label: "EN125 Maritenda", detail: "8100 Boliqueime, Loulé", latitude: 37.1142, longitude: -8.1415, street: "EN125" },
  { id: "loc-6", label: "Av. 5 de Outubro", detail: "8135 Almancil, Loulé", latitude: 37.0856, longitude: -8.0312, street: "Av. 5 de Outubro" },
];

export interface AnomalyFiltersDialogProps {
  filters: AnomalyFilters;
  location: LocationPreset | null;
  pool?: AnomalyPoint[];
  poolLoading: boolean;
  focusGroup?: AnomalyFilterGroup | null;
  canCancel: boolean;
  onApply: (filters: AnomalyFilters, location: LocationPreset | null) => void;
  onCancel: () => void;
}

const PASS_OPTIONS = [
  { value: "", label: "Qualquer" },
  ...PATROL_PASS_MINIMUMS.map((n) => ({ value: String(n), label: `${n}+` })),
];

const DETECTED_OPTIONS = [
  { value: "", label: "Qualquer data" },
  ...DETECTED_WITHIN_DAYS.map((d) => ({ value: String(d), label: `Últimos ${d} dias` })),
];

export const AnomalyFiltersDialog: React.FC<AnomalyFiltersDialogProps> = ({
  filters: initial,
  location: initialLocation,
  pool,
  poolLoading,
  focusGroup,
  canCancel,
  onApply,
  onCancel,
}) => {
  const [draft, setDraft] = React.useState<AnomalyFilters>(initial);
  const [location, setLocation] = React.useState<LocationPreset | null>(initialLocation);
  const [search, setSearch] = React.useState("");
  const titleId = React.useId();

  const matches = React.useMemo(
    () => (pool ? pool.filter((row) => matchesAnomalyFilters(row, draft)).length : undefined),
    [pool, draft],
  );
  const count = activeFilterCount(draft);

  const set = <K extends keyof AnomalyFilters>(key: K, value: AnomalyFilters[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const clear = (group: AnomalyFilterGroup) => setDraft((prev) => clearFilterGroup(prev, group));

  const toggleItem = <T extends string>(arr: T[], item: T): T[] =>
    arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];

  const filteredLocations = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return PRESET_LOCATIONS.slice(0, 4);
    return PRESET_LOCATIONS.filter(
      (loc) => loc.label.toLowerCase().includes(q) || loc.detail.toLowerCase().includes(q),
    );
  }, [search]);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="pointer-events-auto flex max-h-full w-[min(92vw,34rem)] flex-col overflow-hidden rounded-2xl border bg-card elev-3 enter-arc"
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 8 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b px-5 py-3.5">
        <div>
          <h2 id={titleId} className="text-sm font-semibold">
            Filtros de Telemetria Viária
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Filtre quais as deteções YOLOv11 incluídas neste setor. Deixe tudo desmarcado para incluir todas as anomalias.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {(count > 0 || location !== null) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(EMPTY_ANOMALY_FILTERS);
                setLocation(null);
              }}
              className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3" />
              Limpar tudo
            </Button>
          )}
          {canCancel && (
            <Button type="button" variant="ghost" size="icon" onClick={onCancel} aria-label="Fechar filtros" className="-mr-1.5 size-7">
              <X className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 [scrollbar-width:thin]">
        {/* Sector Center / Road */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Centro do Setor / Arruamento
            </h3>
            {location && (
              <button type="button" onClick={() => setLocation(null)} className="text-[11px] font-medium text-primary hover:underline">
                Limpar
              </button>
            )}
          </div>
          {location ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <MapPin className="size-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{location.label}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{location.detail}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLocation(null)}
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Ir para rua ou freguesia (Quarteira, Vilamoura, Loulé, EN125…)"
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {filteredLocations.map((loc) => (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => setLocation(loc)}
                    className="inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    <MapPin className="size-3 text-primary" />
                    {loc.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Anomaly Classification */}
        <section className={cn("flex flex-col gap-2", focusGroup === "types" && "-mx-2 rounded-lg bg-primary/5 p-2")}>
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Tipo de anomalia</h3>
            {draft.types.length > 0 && (
              <button type="button" onClick={() => clear("types")} className="text-[11px] font-medium text-primary hover:underline">
                Limpar
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ANOMALY_TYPE_OPTIONS.map((opt) => {
              const on = draft.types.includes(opt.value as AnomalyType);
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("types", toggleItem(draft.types, opt.value as AnomalyType))}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                    on ? "border-primary/50 bg-primary/10 text-primary" : "bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {on && <Check className="size-3.5" />}
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* Road Hierarchy */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Classificação da via</h3>
            {draft.roadClasses.length > 0 && (
              <button type="button" onClick={() => clear("roadClasses")} className="text-[11px] font-medium text-primary hover:underline">
                Limpar
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ROAD_CLASS_ORDER.map((road) => {
              const on = draft.roadClasses.includes(road);
              return (
                <button
                  key={road}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("roadClasses", toggleItem(draft.roadClasses, road))}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                    on ? "border-primary/50 bg-primary/10 text-primary" : "bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {on && <Check className="size-3.5" />}
                  {road}
                </button>
              );
            })}
          </div>
        </section>

        {/* Repair Dispatch Status */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Estado da ordem de trabalho
            </h3>
            {draft.statuses.length > 0 && (
              <button type="button" onClick={() => clear("statuses")} className="text-[11px] font-medium text-primary hover:underline">
                Limpar
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {REPAIR_STATUS_OPTIONS.map((opt) => {
              const on = draft.statuses.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("statuses", toggleItem(draft.statuses, opt.value))}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                    on ? "border-primary/50 bg-primary/10 text-primary" : "bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {on && <Check className="size-3.5" />}
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* YOLOv11 Confidence & Cavity Size Ranges */}
        <div className="grid grid-cols-2 gap-3">
          <section className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Confiança mín. YOLOv11 (%)
            </Label>
            <Input
              type="text"
              inputMode="numeric"
              min={50}
              max={99}
              placeholder="ex. 85"
              value={draft.confidenceMin ?? ""}
              onChange={(e) => {
                const v = Number(e.target.value.trim().replace(/[\s,_%]/g, ""));
                set("confidenceMin", Number.isFinite(v) && v > 0 ? v : undefined);
              }}
              className="h-8 text-xs tabular-nums"
            />
          </section>
          <section className="flex flex-col gap-1.5">
            <Label className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Área mín. da cavidade (cm²)
            </Label>
            <Input
              type="text"
              inputMode="numeric"
              step={100}
              placeholder="ex. 1000"
              value={draft.areaMin ?? ""}
              onChange={(e) => {
                const v = Number(e.target.value.trim().replace(/[\s,_%]/g, ""));
                set("areaMin", Number.isFinite(v) && v > 0 ? v : undefined);
              }}
              className="h-8 text-xs tabular-nums"
            />
          </section>
        </div>

        {/* Multi-pass verification & Patrol unit */}
        <section className="flex flex-col gap-2">
          <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Passagens de verificação
          </h3>
          <SegmentedControl
            value={draft.passesMin ? String(draft.passesMin) : ""}
            onChange={(v) => set("passesMin", v ? Number(v) : undefined)}
            options={PASS_OPTIONS}
            className="h-8 [&_button]:text-xs"
          />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Detetado nos últimos
          </h3>
          <SegmentedControl
            value={draft.detectedWithinDays ? String(draft.detectedWithinDays) : ""}
            onChange={(v) => set("detectedWithinDays", v ? Number(v) : undefined)}
            options={DETECTED_OPTIONS}
            className="h-8 [&_button]:text-xs"
          />
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Unidade de patrulha</h3>
          <div className="flex flex-wrap gap-1.5">
            {PATROL_UNIT_OPTIONS.map((opt) => {
              const on = draft.patrolKinds.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("patrolKinds", toggleItem(draft.patrolKinds, opt.value))}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                    on ? "border-primary/50 bg-primary/10 text-primary" : "bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {on && <Check className="size-3.5" />}
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-5 py-3">
        <span aria-live="polite" className="text-xs text-muted-foreground tabular-nums">
          {poolLoading || matches === undefined ? (
            "A analisar telemetria…"
          ) : matches === 0 ? (
            <span className="font-medium text-destructive">Nenhuma anomalia corresponde a estes filtros</span>
          ) : (
            <>
              <span className="font-semibold text-foreground">{groupedNumber(matches)}</span>{" "}
              {matches === 1 ? "anomalia correspondente" : "anomalias correspondentes"}
            </>
          )}
        </span>

        <div className="flex items-center gap-2">
          {canCancel && (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancelar
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            disabled={!poolLoading && matches === 0}
            onClick={() => onApply(draft, location)}
          >
            {location
              ? `Auditar ${location.label}`
              : canCancel
                ? "Aplicar filtros"
                : count > 0
                  ? `Continuar com ${count} ${count === 1 ? "filtro" : "filtros"}`
                  : "Explorar todas as anomalias"}
          </Button>
        </div>
      </div>
    </motion.div>
  );
};
