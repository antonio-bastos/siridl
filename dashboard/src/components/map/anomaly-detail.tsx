"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Activity,
  ArrowLeft,
  CalendarClock,
  Camera,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Gauge,
  History,
  Layers,
  MapPin,
  Ruler,
  Scan,
  ShieldAlert,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/reui/badge";
import { Button } from "@/components/ui/button";
import {
  ANOMALY_TYPE_OPTIONS,
  REPAIR_STATUS_OPTIONS,
  SEVERITY_HINT,
  SEVERITY_LABEL,
  anomalyFacts,
  anomalyStanding,
  daysOpenLabel,
  distanceLabel,
  formatAreaPct,
  groupedNumber,
  labelOf,
  roadClassQuartiles,
  similarAnomaliesFor,
  type AnomalyFact,
  type AssessedAnomaly,
  type RepairStatus,
  type SectorAssessment,
  type SeverityBand,
} from "@/models/road-anomalies";
import { SEVERITY_COLOR_VAR, SeverityPill } from "./anomaly-list";
import { SectorThumbnail } from "./sector-thumbnail";
import { SeveritySpectrum, rise } from "./severity-overview";

export interface AnomalyDetailProps {
  row: AssessedAnomaly;
  assessment: SectorAssessment;
  included: boolean;
  onToggleIncluded: () => void;
  onBack: () => void;
  onOpenAnomaly: (id: number) => void;
  onUpdateStatus?: (id: number, status: RepairStatus) => void;
}

const FACT_ICON: Record<AnomalyFact["kind"], React.ComponentType<{ className?: string }>> = {
  coverage: Layers,
  size: Ruler,
  time: Clock,
  confidence: Scan,
  street: MapPin,
  history: History,
};

const REUI_STATUS_VARIANT: Record<RepairStatus, "destructive" | "warning" | "info" | "success"> = {
  pending: "destructive",
  scheduled: "warning",
  in_progress: "info",
  repaired: "success",
};

const REPAIR_STATUS_ICON: Record<RepairStatus, React.ComponentType<{ className?: string }>> = {
  pending: Clock,
  scheduled: CalendarClock,
  in_progress: Wrench,
  repaired: CheckCircle2,
};

const shortDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
};

export const AnomalyDetail: React.FC<AnomalyDetailProps> = ({
  row,
  assessment,
  included,
  onToggleIncluded,
  onBack,
  onOpenAnomaly,
  onUpdateStatus,
}) => {
  const reduceMotion = useReducedMotion();
  const [showDetections, setShowDetections] = React.useState(true);
  const [hoveredId, setHoveredId] = React.useState<number | null>(null);
  const [imgError, setImgError] = React.useState(false);

  React.useEffect(() => {
    setImgError(false);
  }, [row.id, row.image_url]);

  const standing = React.useMemo(() => anomalyStanding(row, assessment), [row, assessment]);
  const facts = React.useMemo(() => anomalyFacts(row, assessment, standing), [row, assessment, standing]);
  const similar = React.useMemo(
    () => similarAnomaliesFor(assessment.rows.filter((r) => r.id !== row.id), row.surface_cm2, row.road_class),
    [assessment.rows, row.id, row.road_class, row.surface_cm2],
  );
  const roadClassStats = React.useMemo(
    () => roadClassQuartiles(assessment.rows, row.road_class),
    [assessment.rows, row.road_class],
  );

  const severity: SeverityBand = row.severity ?? "moderate";
  const severityIndex = row.severity_index ?? Math.round(row.area_pct * 100);
  const q = assessment.quartiles;
  const totalSpeedMs =
    (row.speed_ms?.preprocess ?? 0) + (row.speed_ms?.inference ?? 0) + (row.speed_ms?.postprocess ?? 0);

  const sectorPins = React.useMemo(
    () =>
      assessment.rows
        .filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
        .map((r) => ({
          lat: r.latitude,
          lng: r.longitude,
          color: r.id === row.id ? "#ef4444" : "#0f9488",
          main: r.id === row.id,
        })),
    [assessment.rows, row.id],
  );

  const statusText = labelOf(REPAIR_STATUS_OPTIONS, row.repair_status);
  const typeText = labelOf(ANOMALY_TYPE_OPTIONS, row.anomaly_type);

  return (
    <div className="flex flex-col gap-5 pb-6">
      {/* Top navigation & include/exclude action */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="-ml-2 h-8 gap-1.5 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Voltar ao setor
        </Button>

        <Button
          type="button"
          variant={included ? "outline" : "default"}
          size="sm"
          onClick={onToggleIncluded}
          className="h-7 rounded-md px-2.5 text-[11px] font-medium"
        >
          {included ? "Excluir do cálculo" : "Reincluir no setor"}
        </Button>
      </div>

      {/* Header block: badges, reference, title, street */}
      <motion.section {...(reduceMotion ? {} : rise(0))} className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <SeverityPill severity={severity} />
          <Badge variant={REUI_STATUS_VARIANT[row.repair_status]} size="xs">
            {statusText}
          </Badge>
          <Badge variant="outline" size="xs" className="font-mono tabular-nums">
            #{row.reference}
          </Badge>
          {!included && (
            <Badge variant="secondary" size="xs">
              Excluída da amostra
            </Badge>
          )}
        </div>

        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">{row.title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {row.street} · {row.locality || row.city} · <span className="font-medium text-foreground/80">{row.road_class}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <ShieldAlert className="size-3 text-primary" />
            {typeText}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" />
            {daysOpenLabel(row.days_open)}
          </span>
          <span>{row.patrol_unit}</span>
        </div>
      </motion.section>

      {/* Visual Capture Frame + YOLOv11 Bounding Box Overlay */}
      <motion.section {...(reduceMotion ? {} : rise(0.04))} className="space-y-2">
        <div className="relative overflow-hidden rounded-xl border border-border/80 bg-muted/40">
          {row.image_url && !imgError ? (
            <div className="relative aspect-video w-full overflow-hidden bg-slate-950">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={row.image_url}
                alt={`Captura YOLOv11 — ${row.street}`}
                className="h-full w-full object-cover"
                onError={() => setImgError(true)}
              />

              {showDetections && row.detections.length > 0 && (
                <svg
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  viewBox={`0 0 ${row.image_width || 1280} ${row.image_height || 720}`}
                  preserveAspectRatio="xMidYMid slice"
                >
                  {row.detections.map((box, idx) => {
                    const x = box.x1;
                    const y = box.y1;
                    const w = Math.max(8, box.width || box.x2 - box.x1);
                    const h = Math.max(8, box.height || box.y2 - box.y1);
                    return (
                      <g key={idx}>
                        <rect
                          x={x}
                          y={y}
                          width={w}
                          height={h}
                          fill="rgba(239, 68, 68, 0.14)"
                          stroke="#ef4444"
                          strokeWidth={Math.max(2, (row.image_width || 1280) / 360)}
                          rx={4}
                        />
                        <rect
                          x={x}
                          y={Math.max(0, y - 24)}
                          width={Math.min(w + 54, 170)}
                          height={22}
                          fill="#ef4444"
                          rx={4}
                        />
                        <text
                          x={x + 6}
                          y={Math.max(15, y - 8)}
                          fill="#ffffff"
                          fontSize="12"
                          fontWeight="700"
                          fontFamily="monospace"
                        >
                          {`${box.label ?? "Anomalia"} ${(box.confidence * 100).toFixed(0)}%`}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              )}

              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/75 via-black/35 to-transparent px-3 py-2 text-[11px] text-white">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Camera className="size-3.5 text-teal-300" />
                  Frame {row.image_width}×{row.image_height}
                </span>
                <span className="font-mono tabular-nums text-teal-200">
                  YOLO {(row.confidence * 100).toFixed(1)}% · {formatAreaPct(row.area_pct)}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-muted/60 p-4 text-center">
              <Camera className="size-6 text-muted-foreground/70" />
              <p className="text-xs font-medium text-muted-foreground">
                Telemetria geoespacial registada sem fotograma anexo
              </p>
              <span className="font-mono text-[11px] text-muted-foreground/80">
                Confiança {(row.confidence * 100).toFixed(1)}% · {row.patrol_passes} passagens
              </span>
            </div>
          )}
        </div>

        {/* Positioned cleanly below capture & severity badge, never overlapping top-right close button */}
        {row.detections.length > 0 && row.image_url && !imgError && (
          <div className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-1.5 elev-1 dark:border-input dark:bg-input/30">
            <span className="text-[11px] text-muted-foreground">
              {row.detections.length} {row.detections.length === 1 ? "caixa detetada" : "caixas detetadas"} ·{" "}
              {totalSpeedMs > 0 ? `${totalSpeedMs.toFixed(1)} ms` : "YOLOv11"}
            </span>
            <button
              type="button"
              onClick={() => setShowDetections((v) => !v)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-[11px] font-medium text-foreground elev-1 transition-colors hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
            >
              {showDetections ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
              Alternar caixas delimitadoras YOLOv11
            </button>
          </div>
        )}
      </motion.section>

      {/* Key Metric Grid (4 chunks — Miller's Law) */}
      <motion.section {...(reduceMotion ? {} : rise(0.08))} className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl border bg-background p-3 elev-1 dark:border-input dark:bg-input/30">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Gauge className="size-3.5" style={{ color: SEVERITY_COLOR_VAR[severity] }} />
            Índice de Gravidade
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-semibold tabular-nums text-foreground">{severityIndex}</span>
            <span className="text-[11px] text-muted-foreground">({formatAreaPct(row.area_pct)})</span>
          </div>
        </div>

        <div className="rounded-xl border bg-background p-3 elev-1 dark:border-input dark:bg-input/30">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Ruler className="size-3.5 text-primary" />
            Área da Cavidade
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-semibold tabular-nums text-foreground">
              {groupedNumber(row.cavity_area_cm2)}
            </span>
            <span className="text-[11px] text-muted-foreground">cm²</span>
          </div>
        </div>

        <div className="rounded-xl border bg-background p-3 elev-1 dark:border-input dark:bg-input/30">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Activity className="size-3.5 text-amber-500" />
            Profundidade Est.
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-semibold tabular-nums text-foreground">{row.depth_cm.toFixed(1)}</span>
            <span className="text-[11px] text-muted-foreground">cm</span>
          </div>
        </div>

        <div className="rounded-xl border bg-background p-3 elev-1 dark:border-input dark:bg-input/30">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Scan className="size-3.5 text-teal-600" />
            Passagens / Deteções
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-semibold tabular-nums text-foreground">{row.patrol_passes}</span>
            <span className="text-[11px] text-muted-foreground">
              passagens ({row.detection_count} {row.detection_count === 1 ? "foco" : "focos"})
            </span>
          </div>
        </div>
      </motion.section>

      {/* Repair status selector (if interactive handler supplied) */}
      {onUpdateStatus && (
        <motion.section {...(reduceMotion ? {} : rise(0.1))} className="space-y-2 rounded-xl border bg-background p-3 elev-1 dark:border-input dark:bg-input/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">Estado de Despacho Municipal</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {REPAIR_STATUS_OPTIONS.map((opt) => {
              const active = row.repair_status === opt.value;
              const StatusIcon = REPAIR_STATUS_ICON[opt.value];
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onUpdateStatus(row.id, opt.value)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary elev-1"
                      : "border-border bg-background text-muted-foreground elev-1 hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <StatusIcon className="size-3.5 shrink-0" />
                    <span className="truncate">{opt.label}</span>
                  </span>
                  {active && <CheckCircle2 className="size-3 shrink-0" />}
                </button>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* Sector Spectrum Positioning */}
      {q && (
        <motion.section {...(reduceMotion ? {} : rise(0.12))} className="space-y-2.5 rounded-xl border bg-background p-3.5 elev-1 dark:border-input dark:bg-input/30">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold text-foreground">Posição face ao setor</h3>
              <p className="text-[11px] text-muted-foreground">{SEVERITY_HINT[severity]}</p>
            </div>
            {standing.percentile !== null && (
              <Badge variant="outline" size="xs" className="shrink-0 font-mono tabular-nums">
                Percentil {standing.percentile}%
              </Badge>
            )}
          </div>

          <SeveritySpectrum
            quartiles={q}
            counts={assessment.counts}
            rows={assessment.rows}
            hoveredId={hoveredId}
            onHover={setHoveredId}
            onOpenAnomaly={onOpenAnomaly}
            highlight={{
              severityIndex,
              severity,
              label: `#${row.reference} (${severityIndex})`,
            }}
          />

          <div className="grid grid-cols-3 gap-2 pt-1 text-center text-[11px] text-muted-foreground">
            <div className="rounded-md border bg-background px-2 py-1 elev-1 dark:border-input dark:bg-input/30">
              <div className="text-[10px] uppercase tracking-wider">P25 setor</div>
              <div className="font-mono font-semibold text-foreground">{Math.round(q.p25)}</div>
            </div>
            <div className="rounded-md border bg-background px-2 py-1 elev-1 dark:border-input dark:bg-input/30">
              <div className="text-[10px] uppercase tracking-wider">Mediana</div>
              <div className="font-mono font-semibold text-foreground">{Math.round(q.median)}</div>
            </div>
            <div className="rounded-md border bg-background px-2 py-1 elev-1 dark:border-input dark:bg-input/30">
              <div className="text-[10px] uppercase tracking-wider">P75 setor</div>
              <div className="font-mono font-semibold text-foreground">{Math.round(q.p75)}</div>
            </div>
          </div>

          {roadClassStats.quartiles && (
            <p className="text-[11px] text-muted-foreground">
              Na tipologia <span className="font-medium text-foreground">{row.road_class}</span> ({roadClassStats.count}{" "}
              anomalias), a mediana é{" "}
              <span className="font-mono font-medium text-foreground">
                {Math.round(roadClassStats.quartiles.median)}
              </span>
              .
            </p>
          )}
        </motion.section>
      )}

      {/* Telemetry Insights / Facts */}
      {facts.length > 0 && (
        <motion.section {...(reduceMotion ? {} : rise(0.15))} className="space-y-2">
          <h3 className="text-xs font-semibold text-foreground">Leituras e Contexto Técnico</h3>
          <ul className="space-y-1.5">
            {facts.map((fact, idx) => {
              const Icon = FACT_ICON[fact.kind];
              return (
                <li
                  key={idx}
                  className="flex items-start gap-2.5 rounded-lg border bg-background px-3 py-2 text-xs leading-relaxed elev-1 dark:border-input dark:bg-input/30"
                >
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <span className="text-muted-foreground">
                    <strong className="font-medium text-foreground">{fact.lead}</strong>
                    {fact.rest}
                  </span>
                </li>
              );
            })}
          </ul>
        </motion.section>
      )}

      {/* Multi-pass Progression History */}
      {row.severity_history.length > 0 && (
        <motion.section {...(reduceMotion ? {} : rise(0.18))} className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <TrendingUp className="size-3.5 text-primary" />
            Evolução em Patrulhas ({row.severity_history.length})
          </div>
          <div className="space-y-1.5 rounded-xl border bg-background p-3 elev-1 dark:border-input dark:bg-input/30">
            {row.severity_history.map((entry, idx) => (
              <div key={idx} className="flex items-center justify-between text-[11px]">
                <span className="font-mono text-muted-foreground">{shortDate(entry.at)}</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{formatAreaPct(entry.area_pct)}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {(entry.confidence * 100).toFixed(0)}% conf.
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      )}

      {/* Spatial Sector Thumbnail */}
      <motion.section {...(reduceMotion ? {} : rise(0.2))} className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-foreground">Enquadramento Geográfico</span>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {row.latitude.toFixed(5)}, {row.longitude.toFixed(5)}
          </span>
        </div>
        <SectorThumbnail
          selection={{ kind: "circle", lat: row.latitude, lng: row.longitude, radiusM: 450 }}
          pins={sectorPins}
          height={165}
          className="w-full rounded-xl border elev-1 dark:border-input"
        />
      </motion.section>

      {/* Nearby / Similar Anomalies */}
      {(standing.neighbours.length > 0 || similar.length > 0) && (
        <motion.section {...(reduceMotion ? {} : rise(0.22))} className="space-y-2.5">
          <h3 className="text-xs font-semibold text-foreground">Anomalias Próximas no Setor</h3>
          <div className="space-y-1.5">
            {(standing.neighbours.length > 0 ? standing.neighbours : similar.map((s) => ({ row: s, distanceM: 0 }))).map(
              (item) => {
                const peer = item.row;
                const peerSeverity = peer.severity ?? "moderate";
                return (
                  <button
                    key={peer.id}
                    type="button"
                    onClick={() => onOpenAnomaly(peer.id)}
                    onMouseEnter={() => setHoveredId(peer.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-left elev-1 transition-colors hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: SEVERITY_COLOR_VAR[peerSeverity] }}
                        />
                        <span className="truncate text-xs font-medium text-foreground">{peer.street}</span>
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        #{peer.reference} · {peer.road_class}
                        {item.distanceM > 0 ? ` · a ${distanceLabel(item.distanceM)}` : ""}
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-foreground">
                      {formatAreaPct(peer.area_pct)}
                    </span>
                  </button>
                );
              },
            )}
          </div>
        </motion.section>
      )}
    </div>
  );
};
