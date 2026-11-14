"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  Cpu,
  ExternalLink,
  Flag,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type FalsePositiveReason = "shadow" | "wet_patch" | "tar_line";

interface DetectionItem {
  id: string;
  street?: string;
  parish?: string;
  severity?: string;
  status?: string;
  confidence?: number;
  area_pct?: number;
  estimated_area_cm2?: number;
  image_url?: string;
  detected_at?: string;
  source?: string;
  road_class?: string;
  bbox?: Record<string, number>;
}

interface FlagState {
  loading?: boolean;
  flagged?: boolean;
  reasonLabel?: string;
  r2Uploaded?: boolean;
  r2Keys?: string[];
  localBackupDir?: string;
  error?: string | null;
}

const FALSE_POSITIVE_OPTIONS: { value: FalsePositiveReason; label: string }[] = [
  { value: "shadow", label: "Sombra" },
  { value: "wet_patch", label: "Mancha Húmida" },
  { value: "tar_line", label: "Linha de Alcatrão" },
];

export default function DetectionsFeedPage() {
  const [detections, setDetections] = React.useState<DetectionItem[]>([]);
  const [modelName, setModelName] = React.useState<string>("SIRI-DL YOLOv11s");
  const [loading, setLoading] = React.useState<boolean>(true);
  const [selectedReason, setSelectedReason] = React.useState<Record<string, FalsePositiveReason>>({});
  const [flagStates, setFlagStates] = React.useState<Record<string, FlagState>>({});

  const loadDetections = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/detections", { cache: "no-store" });
      const data = await res.json();
      setDetections(Array.isArray(data.anomalies) ? data.anomalies : []);
      if (typeof data.model === "string") {
        setModelName(data.model);
      }
    } catch {
      setDetections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadDetections();
  }, [loadDetections]);

  const handleFlagFalsePositive = async (item: DetectionItem, reasonOverride?: FalsePositiveReason) => {
    const reason = reasonOverride ?? selectedReason[item.id] ?? "shadow";
    setFlagStates((prev) => ({
      ...prev,
      [item.id]: { loading: true, error: null },
    }));

    try {
      const res = await fetch("/api/active-learning/false-positive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          detection_id: item.id,
          reason,
          image_url: item.image_url,
          street: item.street,
          parish: item.parish,
          confidence: item.confidence,
          bbox: item.bbox,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setFlagStates((prev) => ({
          ...prev,
          [item.id]: {
            loading: false,
            flagged: false,
            error: data?.r2_error || data?.detail || "Falha ao enviar falso positivo.",
          },
        }));
        return;
      }

      setFlagStates((prev) => ({
        ...prev,
        [item.id]: {
          loading: false,
          flagged: true,
          reasonLabel: data.reason_label_pt ?? reason,
          r2Uploaded: Boolean(data.r2_uploaded),
          r2Keys: Array.isArray(data.r2_keys) ? data.r2_keys : [],
          localBackupDir: data.local_backup_dir,
          error: data.r2_error ?? null,
        },
      }));
    } catch {
      setFlagStates((prev) => ({
        ...prev,
        [item.id]: {
          loading: false,
          flagged: false,
          error: "Erro de rede ao contactar o serviço de Active Learning.",
        },
      }));
    }
  };

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card/80 p-5 shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
              <Cpu className="size-4" />
              Active Learning &amp; Hard-Negative Mining
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Feed de Deteções YOLOv11
            </h1>
            <p className="text-sm text-muted-foreground">
              Modelo ativo: <span className="font-medium text-foreground">{modelName}</span> ·
              Sinalize falsos positivos para guardar automaticamente o fotograma e a etiqueta vazia em{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">retrain_dataset/</code> (Cloudflare R2).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void loadDetections()} disabled={loading}>
              <RefreshCw className={cn("mr-1.5 size-3.5", loading && "animate-spin")} />
              Atualizar
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/api/detections" target="_blank">
                JSON Bruto
                <ExternalLink className="ml-1.5 size-3.5" />
              </Link>
            </Button>
          </div>
        </header>

        {loading ? (
          <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
            A carregar feed de deteções...
          </div>
        ) : detections.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card p-8 text-center text-sm text-muted-foreground">
            Nenhuma deteção disponível no momento.
          </div>
        ) : (
          <div className="grid gap-3">
            {detections.map((item) => {
              const state = flagStates[item.id];
              const reason = selectedReason[item.id] ?? "shadow";
              const confPct =
                typeof item.confidence === "number"
                  ? `${Math.round(item.confidence * 100)}%`
                  : "—";

              return (
                <div
                  key={item.id}
                  className="flex flex-col justify-between gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-xs sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 items-start gap-3.5">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <AlertTriangle className="size-5" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-muted-foreground">
                          {item.id}
                        </span>
                        <span className="truncate font-semibold text-foreground">
                          {item.street || "Via Municipal (Loulé)"}
                        </span>
                        {item.parish && (
                          <Badge variant="outline" className="text-[11px]">
                            {item.parish}
                          </Badge>
                        )}
                        {item.severity && (
                          <Badge
                            variant={item.severity === "Crítica" || item.severity === "Alta" ? "destructive" : "secondary"}
                            className="text-[11px]"
                          >
                            {item.severity}
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Confiança: {confPct}</span>
                        {typeof item.estimated_area_cm2 === "number" && (
                          <span>Área: {item.estimated_area_cm2.toFixed(0)} cm²</span>
                        )}
                        {item.road_class && <span>Via: {item.road_class}</span>}
                        {item.detected_at && (
                          <span>{new Date(item.detected_at).toLocaleString("pt-PT")}</span>
                        )}
                      </div>

                      {state?.flagged && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="size-3.5" />
                          <span>
                            Falso positivo ({state.reasonLabel}) registado em{" "}
                            <code className="rounded bg-emerald-500/10 px-1 py-0.5">
                              {state.r2Uploaded ? "siri-dl/retrain_dataset/" : state.localBackupDir || "retrain_dataset/"}
                            </code>
                          </span>
                        </div>
                      )}

                      {state?.error && (
                        <div className="flex items-center gap-1.5 pt-1 text-xs text-amber-600 dark:text-amber-400">
                          <ShieldAlert className="size-3.5" />
                          <span>{state.error}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <select
                      aria-label={`Motivo de falso positivo para ${item.id}`}
                      value={reason}
                      disabled={Boolean(state?.loading || state?.flagged)}
                      onChange={(e) =>
                        setSelectedReason((prev) => ({
                          ...prev,
                          [item.id]: e.target.value as FalsePositiveReason,
                        }))
                      }
                      className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      {FALSE_POSITIVE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    <Button
                      size="sm"
                      variant={state?.flagged ? "secondary" : "outline"}
                      disabled={Boolean(state?.loading || state?.flagged)}
                      onClick={() => void handleFlagFalsePositive(item)}
                      className="gap-1.5"
                    >
                      {state?.loading ? (
                        <CloudUpload className="size-3.5 animate-pulse" />
                      ) : (
                        <Flag className="size-3.5" />
                      )}
                      {state?.flagged ? "Guardado em R2" : "Falso Positivo"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
