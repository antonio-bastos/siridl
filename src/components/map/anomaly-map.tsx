"use client";

import dynamic from "next/dynamic";
import type { AnomalyMapProps } from "./anomaly-map-inner";

export type { AnomalyMapProps, MapTool, RoadMarkerPin } from "./anomaly-map-inner";

export const AnomalyMap = dynamic<AnomalyMapProps>(
  () => import("./anomaly-map-inner").then((mod) => mod.AnomalyMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
        A carregar mapa de Loulé…
      </div>
    ),
  },
);
