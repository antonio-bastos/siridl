"use client";

import dynamic from "next/dynamic";
import type { LocationPickerMapProps } from "./location-picker-map-inner";

export type { LocationPickerMapProps };

export const LocationPickerMap = dynamic<LocationPickerMapProps>(
  () => import("./location-picker-map-inner").then((mod) => mod.LocationPickerMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-52 w-full items-center justify-center rounded-xl border border-border bg-muted text-xs text-muted-foreground">
        A carregar mapa de seleção…
      </div>
    ),
  },
);
