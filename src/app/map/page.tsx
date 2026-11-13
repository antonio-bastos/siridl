"use client";

import React from "react";
import { AppShell } from "@/components/layout/app-shell";
import { AnomalyMapWorkspace } from "@/components/map/anomaly-map-workspace";
import {
  DEFAULT_AUDIT_ID,
  INITIAL_SECTOR_AUDITS,
  SIRI_ANOMALIES,
  SIRI_REPAIRED_HISTORY,
} from "@/models/siri-potholes";
import {
  EMPTY_ANOMALY_FILTERS,
  selectedAnomalyRefOf,
  sectorAuditFromParams,
  type RoadAnomaly,
  type SectorAudit,
} from "@/models/road-anomalies";

const PAGE_TITLE = "SIRI-DL — Mapa Geoespacial de Anomalias em Loulé";

export default function MapPage() {
  const [openAnomaly, setOpenAnomaly] = React.useState<RoadAnomaly | null>(null);

  const initialAudit = React.useMemo<SectorAudit>(() => {
    const base =
      INITIAL_SECTOR_AUDITS.find((a) => a.id === DEFAULT_AUDIT_ID) ??
      INITIAL_SECTOR_AUDITS[0];

    if (typeof window === "undefined" || !window.location.search) {
      return base;
    }

    const parsed = sectorAuditFromParams(new URLSearchParams(window.location.search));
    const hasCustomFilters =
      parsed.filters.types.length > 0 ||
      parsed.filters.roadClasses.length > 0 ||
      parsed.filters.statuses.length > 0 ||
      parsed.filters.patrolKinds.length > 0 ||
      parsed.filters.areaMin !== undefined ||
      parsed.filters.areaMax !== undefined ||
      parsed.filters.confidenceMin !== undefined ||
      parsed.filters.confidenceMax !== undefined ||
      parsed.filters.passesMin !== undefined ||
      parsed.filters.detectedWithinDays !== undefined;

    return {
      ...base,
      selection: parsed.selection ?? base.selection,
      filters: hasCustomFilters ? parsed.filters : base.filters ?? EMPTY_ANOMALY_FILTERS,
    };
  }, []);

  const initialAnomalyId = React.useMemo<number | null>(() => {
    if (typeof window === "undefined") return null;
    const ref = selectedAnomalyRefOf(window.location.hash);
    if (!ref) return null;
    const found = SIRI_ANOMALIES.find((a) => a.reference === ref || String(a.id) === ref);
    return found?.id ?? null;
  }, []);

  React.useEffect(() => {
    document.title = openAnomaly
      ? `#${openAnomaly.reference} · ${openAnomaly.street} — SIRI-DL`
      : PAGE_TITLE;
  }, [openAnomaly]);

  return (
    <AppShell>
      <AnomalyMapWorkspace
        initialAnomalies={SIRI_ANOMALIES}
        repairedPool={SIRI_REPAIRED_HISTORY}
        initialAudit={initialAudit}
        initialAnomalyId={initialAnomalyId}
        onOpenAnomalyChange={setOpenAnomaly}
      />
    </AppShell>
  );
}
