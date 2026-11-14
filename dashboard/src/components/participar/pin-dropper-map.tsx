"use client";

import dynamic from "next/dynamic";
import type { PinDropperMapProps } from "./pin-dropper-map-inner";

const PinDropperMapDynamic = dynamic<PinDropperMapProps>(
  () => import("./pin-dropper-map-inner").then((mod) => mod.PinDropperMapInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500">
        A carregar mapa interativo de Loulé...
      </div>
    ),
  },
);

export function PinDropperMap(props: PinDropperMapProps) {
  return <PinDropperMapDynamic {...props} />;
}
