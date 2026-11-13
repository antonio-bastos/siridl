"use client";

import React from "react";
import NumberFlow, { type Format } from "@number-flow/react";
import { motion, useReducedMotion } from "motion/react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/reui/alert";
import { useLatestCallback } from "@/hooks/use-latest-callback";
import {
  MIN_SAMPLE,
  SEVERITY_BANDS,
  SEVERITY_HINT,
  SEVERITY_SHORT,
  TELEMETRY_RELIABILITY_LABEL,
  WIDEN_RADIUS_M,
  radiusLabel,
  type AssessedAnomaly,
  type Quartiles,
  type ResolutionStats,
  type RoadClassShare,
  type SectorAssessment,
  type SectorSelection,
  type SeverityBand,
  type TelemetryReliability,
  type TriageTarget,
} from "@/models/road-anomalies";
import { SEVERITY_COLOR_VAR } from "./anomaly-list";

export type AnalysisFocus = TriageTarget;
export const EMPTY_FOCUS: AnalysisFocus = { road_class: "" };

export interface SeverityOverviewProps {
  assessment: SectorAssessment | null;
  selection?: SectorSelection | null;
  filtersSummary: string;
  onEditFilters: () => void;
  onResetFilters?: () => void;
  loading: boolean;
  error?: string | null;
  idle?: React.ReactNode;
  areaLabel?: string;
  hoveredId: number | null;
  onHover: (id: number | null) => void;
  onOpenAnomaly?: (id: number) => void;
  onWidenRadius?: (radiusM: number) => void;
  focusTarget?: TriageTarget | null;
  onFocusTargetChange?: (target: TriageTarget | null) => void;
  onReincludeAll?: () => void;
}

const EASE = [0.22, 1, 0.36, 1] as const;

export const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.28, delay, ease: EASE },
});

const NUMBER_TIMING = { duration: 480, easing: "cubic-bezier(0.22, 1, 0.36, 1)" } as const;

export const CountUp: React.FC<{ value: number; format?: Format; prefix?: string; suffix?: string }> = ({
  value,
  format,
  prefix,
  suffix,
}) => (
  <NumberFlow
    locales="pt-PT"
    value={value}
    format={format}
    prefix={prefix}
    suffix={suffix}
    transformTiming={NUMBER_TIMING}
    spinTiming={NUMBER_TIMING}
    opacityTiming={{ duration: 220, easing: "ease-out" }}
  />
);

const RELIABILITY_BARS: Record<TelemetryReliability, number> = { low: 1, medium: 2, high: 3 };
const RELIABILITY_COLOR: Record<TelemetryReliability, string> = {
  low: "var(--status-serious)",
  medium: "var(--status-warning)",
  high: "var(--status-good)",
};

export const TelemetryConfidence: React.FC<{
  level?: TelemetryReliability;
  count?: number;
  spread?: number;
  reliability?: { level: TelemetryReliability; spread: number };
  measured?: number;
  className?: string;
}> = (props) => {
  const level = props.level ?? props.reliability?.level ?? "medium";
  const count = props.count ?? props.measured ?? 0;
  const spread = props.spread ?? props.reliability?.spread ?? 0.3;
  const filled = RELIABILITY_BARS[level];
  const color = RELIABILITY_COLOR[level];
  const spreadPct = Math.round(spread * 100);
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", props.className)}
      title={`A metade central abrange ${spreadPct}% da mediana em ${count} anomalias detetadas`}
    >
      <span aria-hidden className="inline-flex items-end gap-[2px]">
        {[1, 2, 3].map((bar) => (
          <span
            key={bar}
            className="w-[3px] rounded-[1px]"
            style={{
              height: 4 + bar * 3,
              background: bar <= filled ? color : "var(--border)",
            }}
          />
        ))}
      </span>
      <span>{TELEMETRY_RELIABILITY_LABEL[level]}</span>
      <span className="text-muted-foreground/60">·</span>
      <span className="tabular-nums">
        {count} {count === 1 ? "anomalia" : "anomalias"}
      </span>
    </span>
  );
};

/* ------------------------------------------------------------------ */
/* Severity Spectrum (KDE density + interactive ticks)                 */
/* ------------------------------------------------------------------ */

const VB_W = 360;
const CURVE_TOP = 6;
const CURVE_BOTTOM = 76;
const CURVE_H = CURVE_BOTTOM - CURVE_TOP;
const SAMPLES = 72;

type CountedRow = AssessedAnomaly & { severity_index: number; severity: SeverityBand };
const isCounted = (row: AssessedAnomaly): row is CountedRow =>
  row.severity_index !== undefined && row.severity !== undefined;

interface SpectrumTickProps {
  row: CountedRow;
  leftPct: number;
  hot: boolean;
  onHover: (id: number | null) => void;
  onOpen: (id: number) => void;
}

const SpectrumTick = React.memo<SpectrumTickProps>(function SpectrumTick({ row: p, leftPct, hot, onHover, onOpen }) {
  return (
    <button
      type="button"
      aria-label={`Inspecionar ${p.reference} (${p.street}), ${p.area_pct.toFixed(2)}% da imagem`}
      onMouseEnter={() => onHover(p.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(p.id)}
      onBlur={() => onHover(null)}
      onClick={() => onOpen(p.id)}
      style={{ left: `${leftPct}%` }}
      className="group absolute inset-y-0 w-3 -translate-x-1/2 cursor-pointer outline-none"
    >
      <span
        style={{ background: hot ? "var(--foreground)" : SEVERITY_COLOR_VAR[p.severity] }}
        className={cn(
          "pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all",
          hot ? "h-4 w-[3px] ring-2 ring-background" : "h-2.5 w-[2px] opacity-75 group-hover:h-3.5 group-hover:opacity-100",
        )}
      />
    </button>
  );
});

export const SeveritySpectrum: React.FC<{
  quartiles: Quartiles;
  counts?: Record<SeverityBand, number>;
  rows: AssessedAnomaly[];
  hoveredId: number | null;
  onHover: (id: number | null) => void;
  onOpenAnomaly?: (id: number) => void;
  highlight?: { severityIndex: number; severity: SeverityBand; label?: string };
}> = ({ quartiles: q, counts: providedCounts, rows, hoveredId, onHover, onOpenAnomaly, highlight }) => {
  const id = React.useId();
  const reducedMotion = useReducedMotion();
  const hover = useLatestCallback(onHover);
  const openAnomaly = useLatestCallback(onOpenAnomaly ?? (() => {}));
  const points = React.useMemo(() => rows.filter(isCounted), [rows]);

  const counts = React.useMemo<Record<SeverityBand, number>>(() => {
    if (providedCounts) return providedCounts;
    const tally: Record<SeverityBand, number> = { low: 0, moderate: 0, critical: 0 };
    for (const p of points) tally[p.severity] += 1;
    return tally;
  }, [providedCounts, points]);

  const span = q.max - q.min || 1;
  const lo = Math.max(0, q.min - span * 0.06);
  const hi = q.max + span * 0.06;
  const xPct = (v: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));

  const p25Pct = xPct(q.p25);
  const medPct = xPct(q.median);
  const p75Pct = xPct(q.p75);
  const markerPct = highlight ? xPct(highlight.severityIndex) : undefined;

  const { areaPath, linePath } = React.useMemo(() => {
    const values = points.map((p) => p.severity_index);
    const iqr = q.p75 - q.p25;
    const bw = Math.max((iqr || span * 0.35 || 1) * 0.42, (hi - lo) * 0.05);

    const xs = Array.from({ length: SAMPLES }, (_, i) => lo + ((hi - lo) * i) / (SAMPLES - 1));
    const densities = xs.map((v) =>
      values.reduce((sum, pv) => {
        const u = (v - pv) / bw;
        return sum + Math.exp(-0.5 * u * u);
      }, 0),
    );
    const peak = Math.max(...densities, 1e-6);
    const coords = xs.map((v, i) => {
      const x = (xPct(v) / 100) * VB_W;
      const y = CURVE_BOTTOM - (densities[i] / peak) * (CURVE_H - 4);
      return [x, y] as const;
    });

    const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const area = `${line} L${VB_W},${CURVE_BOTTOM} L0,${CURVE_BOTTOM} Z`;
    return { areaPath: area, linePath: line };
  }, [points, q.p25, q.p75, span, lo, hi]);

  const bands: { severity: SeverityBand; from: number; to: number }[] = [
    { severity: "low", from: 0, to: p25Pct },
    { severity: "moderate", from: p25Pct, to: p75Pct },
    { severity: "critical", from: p75Pct, to: 100 },
  ];

  const hovered = hoveredId !== null ? points.find((p) => p.id === hoveredId) : undefined;
  const totalCount = SEVERITY_BANDS.reduce((sum, b) => sum + counts[b], 0) || 1;

  return (
    <div className="select-none rounded-2xl border border-border/80 bg-card/80 p-3.5 elev-1">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          Distribuição da Gravidade
        </span>
        {hovered ? (
          <span className="truncate rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground tabular-nums">
            {hovered.reference} · {hovered.area_pct.toFixed(2)}%
          </span>
        ) : (
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {(q.min / 100).toFixed(2)}% – {(q.max / 100).toFixed(2)}%
          </span>
        )}
      </div>

      {/* Proportional Segmented Share Bar */}
      <div
        className="mb-3.5 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted p-0.5"
        aria-label="Barra de distribuição da gravidade"
      >
        {SEVERITY_BANDS.map((band) => {
          const pct = (counts[band] / totalCount) * 100;
          if (pct <= 0) return null;
          return (
            <div
              key={band}
              style={{ width: `${pct}%`, background: SEVERITY_COLOR_VAR[band] }}
              title={`${SEVERITY_SHORT[band]}: ${counts[band]} (${Math.round(pct)}%)`}
              className="h-full rounded-full transition-[width] duration-[var(--dur-base)] ease-[var(--ease-out)]"
            />
          );
        })}
      </div>

      {/* KDE Density Curve */}
      <div className="relative h-16">
        <svg viewBox={`0 0 ${VB_W} ${CURVE_BOTTOM}`} preserveAspectRatio="none" className="h-full w-full overflow-visible">
          <defs>
            {bands.map(({ severity, from, to }) => (
              <React.Fragment key={severity}>
                <clipPath id={`${id}-clip-${severity}`}>
                  <rect
                    x={(from / 100) * VB_W}
                    y={0}
                    width={Math.max(0, ((to - from) / 100) * VB_W)}
                    height={CURVE_BOTTOM}
                  />
                </clipPath>
                <linearGradient id={`${id}-grad-${severity}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SEVERITY_COLOR_VAR[severity]} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={SEVERITY_COLOR_VAR[severity]} stopOpacity={0.04} />
                </linearGradient>
              </React.Fragment>
            ))}
          </defs>

          {bands.map(({ severity }, i) => (
            <g key={severity} clipPath={`url(#${id}-clip-${severity})`}>
              <motion.path
                d={areaPath}
                fill={`url(#${id}-grad-${severity})`}
                initial={reducedMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25, delay: 0.04 + i * 0.04, ease: EASE }}
              />
              <motion.path
                d={linePath}
                fill="none"
                stroke={SEVERITY_COLOR_VAR[severity]}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                initial={reducedMotion ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.28, ease: EASE }}
              />
            </g>
          ))}

          {[p25Pct, p75Pct].map((pct) => (
            <line
              key={pct}
              x1={(pct / 100) * VB_W}
              x2={(pct / 100) * VB_W}
              y1={CURVE_TOP + 6}
              y2={CURVE_BOTTOM}
              stroke="var(--border)"
              strokeDasharray="2 2"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        <div
          className="pointer-events-none absolute inset-y-0 w-[1.5px] -translate-x-1/2 bg-foreground/70"
          style={{ left: `${medPct}%` }}
        >
          <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 rounded-md bg-foreground px-1.5 py-0.5 text-[9px] leading-none font-semibold whitespace-nowrap text-background tabular-nums shadow-xs">
            mediana {(q.median / 100).toFixed(2)}%
          </span>
        </div>

        {highlight && markerPct !== undefined && (
          <div
            className="pointer-events-none absolute inset-y-0 w-[2px] -translate-x-1/2"
            style={{ left: `${markerPct}%`, background: SEVERITY_COLOR_VAR[highlight.severity] }}
          >
            {highlight.label && (
              <span
                className="absolute bottom-0.5 left-1/2 -translate-x-1/2 rounded-md px-1.5 py-0.5 text-[9px] leading-none font-semibold whitespace-nowrap text-white tabular-nums shadow-xs"
                style={{ background: SEVERITY_COLOR_VAR[highlight.severity] }}
              >
                {highlight.label}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Tick rail */}
      <div className="relative h-4 border-t border-border/70">
        {points.map((p) => (
          <SpectrumTick
            key={p.id}
            row={p}
            leftPct={xPct(p.severity_index)}
            hot={p.id === hoveredId}
            onHover={hover}
            onOpen={openAnomaly}
          />
        ))}
      </div>

      {/* 3 Tier Summary Cards */}
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        {SEVERITY_BANDS.map((band) => {
          const count = counts[band];
          const pct = Math.round((count / totalCount) * 100);
          return (
            <div
              key={band}
              title={SEVERITY_HINT[band]}
              className="flex flex-col gap-0.5 rounded-xl border border-border/70 bg-background/70 px-2.5 py-2"
            >
              <div className="flex items-center gap-1.5">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: SEVERITY_COLOR_VAR[band] }} />
                <span className="truncate text-[11px] font-medium text-muted-foreground">
                  {SEVERITY_SHORT[band]}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-1 pt-0.5">
                <span className="text-sm font-bold tracking-tight text-foreground tabular-nums">{count}</span>
                <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Municipal Repair Turnaround                                         */
/* ------------------------------------------------------------------ */

const RepairTurnaround: React.FC<{ resolvedBySeverity: Record<SeverityBand, ResolutionStats> }> = ({
  resolvedBySeverity,
}) => {
  const totalResolved = SEVERITY_BANDS.reduce((sum, b) => sum + resolvedBySeverity[b].count, 0);
  if (totalResolved === 0) return null;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <h4 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Tempo de resposta municipal
        </h4>
        <span className="text-[11px] text-muted-foreground tabular-nums">{totalResolved} reparados nos últimos 30d</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {SEVERITY_BANDS.map((band) => {
          const { count, days } = resolvedBySeverity[band];
          return (
            <div key={band} className="rounded-lg border bg-card px-2.5 py-2">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: SEVERITY_COLOR_VAR[band] }} />
                <span className="truncate">{SEVERITY_SHORT[band]}</span>
              </div>
              <div className="mt-1 flex items-baseline gap-1 tabular-nums">
                {days !== null ? (
                  <>
                    <span className="text-base leading-none font-semibold">
                      <CountUp value={days} />
                    </span>
                    <span className="text-[11px] text-muted-foreground">{days === 1 ? "dia" : "dias"}</span>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
                {count === 0 ? "sem registos" : `mediana · ${count} repar.`}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* By Road Class Breakdown                                             */
/* ------------------------------------------------------------------ */

const RoadClassBreakdown: React.FC<{ mix: RoadClassShare[] }> = ({ mix }) => {
  if (mix.length <= 1) return null;
  const maxMedian = Math.max(...mix.map((m) => m.median ?? 0), 1);

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <h4 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Por classificação da via
        </h4>
        <span className="text-[11px] text-muted-foreground">mediana área %</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {mix.map(({ roadClass, count, median }) => {
          const barPct = median ? Math.max(8, (median / maxMedian) * 100) : 0;
          return (
            <div key={roadClass} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 text-xs">
              <span className="truncate font-medium">
                {roadClass} <span className="font-normal text-muted-foreground tabular-nums">({count})</span>
              </span>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full rounded-full bg-primary/70"
                  initial={{ width: 0 }}
                  animate={{ width: `${barPct}%` }}
                  transition={{ duration: 0.45, ease: EASE }}
                />
              </div>
              <span className="w-16 text-right font-medium tabular-nums">
                {median !== null ? `${(median / 100).toFixed(2)}%` : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Main Sector Severity Overview Panel                                 */
/* ------------------------------------------------------------------ */

export const SeverityOverview: React.FC<SeverityOverviewProps> = ({
  assessment,
  selection,
  onResetFilters,
  loading,
  error,
  idle,
  hoveredId,
  onHover,
  onOpenAnomaly,
  onWidenRadius,
  onReincludeAll,
}) => {
  const canWiden = selection?.kind === "circle" && selection.radiusM < WIDEN_RADIUS_M && !!onWidenRadius;
  const nextRadius = selection?.kind === "circle" ? Math.min(WIDEN_RADIUS_M, selection.radiusM * 2) : WIDEN_RADIUS_M;

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>Erro de leitura de telemetria</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!assessment && !loading && idle) {
    return <>{idle}</>;
  }

  if (loading || !assessment) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <div>
          <Skeleton className="h-3 w-36" />
          <Skeleton className="mt-2 h-8 w-44" />
          <Skeleton className="mt-1.5 h-3.5 w-48" />
        </div>
        <Skeleton className="h-28 w-full rounded-lg" />
        <div className="grid grid-cols-3 gap-1.5">
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
      </div>
    );
  }

  const { quartiles: q, counts, resolvedBySeverity, reliability, roadClassMix, enough, measured, excluded } = assessment;
  const criticalCount = counts.critical;

  return (
    <div className="flex flex-col gap-5">
      {!enough || !q ? (
        <div className="rounded-xl border border-dashed p-5 text-center">
          <p className="text-sm font-medium">
            {measured === 0
              ? "Nenhum buraco corresponde aos filtros"
              : `Apenas ${measured} ${measured === 1 ? "anomalia" : "anomalias"} encontrada${measured === 1 ? "" : "s"}`}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            São necessárias pelo menos {MIN_SAMPLE} deteções para calcular quartis fiáveis de gravidade.
            {excluded.length > 0 && ` (${excluded.length} desmarcadas no separador Anomalias.)`}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {canWiden && (
              <Button size="sm" variant="outline" onClick={() => onWidenRadius?.(nextRadius)}>
                Alargar para {radiusLabel(nextRadius)}
              </Button>
            )}
            {excluded.length > 0 && onReincludeAll && (
              <Button size="sm" variant="outline" onClick={onReincludeAll}>
                Incluir as {excluded.length} desmarcadas
              </Button>
            )}
            {onResetFilters && (
              <Button size="sm" variant="ghost" onClick={onResetFilters}>
                Repor filtros
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Headline Severity Figure */}
          <motion.div {...rise(0)}>
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Mediana municipal de gravidade
            </p>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-3xl leading-none font-bold tracking-tight tabular-nums">
                <CountUp value={q.median / 100} format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }} />
              </span>
              <span className="text-sm font-medium text-muted-foreground">% da imagem</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {reliability && <TelemetryConfidence level={reliability.level} count={measured} spread={reliability.spread} />}
              {excluded.length > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">· {excluded.length} excluídas</span>
              )}
            </div>
          </motion.div>

          {/* ReUI Alert for Critical Anomalies requiring 48h SLA */}
          {criticalCount > 0 && (
            <motion.div {...rise(0.03)}>
              <Alert variant="warning" role="status">
                <AlertTriangle />
                <AlertTitle>
                  {criticalCount} {criticalCount === 1 ? "Buraco Crítico Requer" : "Buracos Críticos Requerem"} Despacho Prioritário
                </AlertTitle>
                <AlertDescription>
                  Cavidades superiores a {(q.p75 / 100).toFixed(2)}% de cobertura representam risco de aquaplanagem e danos estruturais nas vias municipais.
                </AlertDescription>
              </Alert>
            </motion.div>
          )}

          {/* Severity Distribution */}
          <motion.div {...rise(0.05)}>
            <SeveritySpectrum
              quartiles={q}
              counts={counts}
              rows={assessment.rows}
              hoveredId={hoveredId}
              onHover={onHover}
              onOpenAnomaly={onOpenAnomaly}
            />
          </motion.div>

          {/* Municipal Repair Turnaround */}
          <motion.div {...rise(0.1)}>
            <RepairTurnaround resolvedBySeverity={resolvedBySeverity} />
          </motion.div>

          {/* Road Classification Breakdown */}
          <motion.div {...rise(0.14)}>
            <RoadClassBreakdown mix={roadClassMix} />
          </motion.div>
        </>
      )}
    </div>
  );
};
