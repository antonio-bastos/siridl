"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { selectionBounds, type SectorSelection } from "@/models/road-anomalies";

export type SectorBasemap = "map" | "satellite";

export interface ThumbnailPin {
  lat: number;
  lng: number;
  color: string;
  main?: boolean;
}

const TILE = 256;
const DEFAULT_STRIP_WIDTH = 480;
const MIN_ZOOM = 9;
const MAX_ZOOM = 17;
const SELECTION_COLOR = "#0f9488";

const TILE_URL: Record<SectorBasemap, (z: number, x: number, y: number) => string> = {
  map: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  satellite: (z, x, y) =>
    `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
};

const SATELLITE_LABELS = (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${z}/${y}/${x}`;

const BASEMAP_KEY = "siridl:location-basemap";
const storedBasemap = (): SectorBasemap => {
  try {
    return window.localStorage.getItem(BASEMAP_KEY) === "satellite" ? "satellite" : "map";
  } catch {
    return "map";
  }
};
const onStorage = (change: () => void) => {
  window.addEventListener("storage", change);
  return () => window.removeEventListener("storage", change);
};

const project = (lat: number, lng: number, z: number) => {
  const world = TILE * 2 ** z;
  const sin = Math.sin((lat * Math.PI) / 180);
  return [((lng + 180) / 360) * world, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world] as const;
};

export const SectorThumbnail: React.FC<{
  selection: SectorSelection;
  height?: number;
  width?: number;
  pins?: ThumbnailPin[];
  basemap?: SectorBasemap;
  muted?: boolean;
  className?: string;
}> = ({ selection, height = 128, width: stripWidth = DEFAULT_STRIP_WIDTH, pins, basemap: named, muted, className }) => {
  const stored = React.useSyncExternalStore(onStorage, storedBasemap, () => "map" as const);
  const basemap = named ?? stored;
  const layout = React.useMemo(() => {
    const b = selectionBounds(selection);
    const lat = selection.kind === "circle" ? selection.lat : (b.north + b.south) / 2;
    const lng = selection.kind === "circle" ? selection.lng : (b.east + b.west) / 2;

    let z = MAX_ZOOM;
    for (; z > MIN_ZOOM; z--) {
      const [west, north] = project(b.north, b.west, z);
      const [east, south] = project(b.south, b.east, z);
      if (south - north <= height * 0.66 && east - west <= stripWidth * 0.8) break;
    }

    const [cx, cy] = project(lat, lng, z);
    const left = cx - stripWidth / 2;
    const top = cy - height / 2;
    const count = 2 ** z;
    const tiles: { key: string; src: string; labels?: string; x: number; y: number }[] = [];
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + stripWidth) / TILE); tx++) {
      for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + height) / TILE); ty++) {
        if (ty < 0 || ty >= count) continue;
        const wrapped = ((tx % count) + count) % count;
        tiles.push({
          key: `${tx}:${ty}`,
          src: TILE_URL[basemap](z, wrapped, ty),
          labels: basemap === "satellite" ? SATELLITE_LABELS(z, wrapped, ty) : undefined,
          x: tx * TILE - left,
          y: ty * TILE - top,
        });
      }
    }

    const at = (la: number, ln: number) => {
      const [x, y] = project(la, ln, z);
      return [x - left, y - top] as const;
    };
    const shape =
      selection.kind === "circle"
        ? (() => {
            const [x, y] = at(selection.lat, selection.lng);
            const [, yEdge] = at(selection.lat + selection.radiusM / 111_320, selection.lng);
            return { kind: "circle" as const, x, y, r: y - yEdge };
          })()
        : selection.kind === "polygon"
          ? {
              kind: "polygon" as const,
              points: selection.points.map(([la, ln]) => at(la, ln).join(",")).join(" "),
            }
          : (() => {
              const [x0, y0] = at(selection.north, selection.west);
              const [x1, y1] = at(selection.south, selection.east);
              return { kind: "rect" as const, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
            })();
    const dots = (pins ?? []).map((pin) => {
      const [x, y] = at(pin.lat, pin.lng);
      return { ...pin, x, y };
    });
    return { tiles, shape, dots };
  }, [selection, height, stripWidth, pins, basemap]);

  return (
    <div aria-hidden className={cn("relative overflow-hidden bg-muted", className)} style={{ height }}>
      <div className="absolute top-0 left-1/2" style={{ width: stripWidth, height, marginLeft: -stripWidth / 2 }}>
        {layout.tiles.map((tile) => (
          <React.Fragment key={tile.key}>
            <img
              src={tile.src}
              alt=""
              width={TILE}
              height={TILE}
              loading="lazy"
              decoding="async"
              draggable={false}
              className={cn(
                "absolute max-w-none select-none dark:brightness-[0.8] dark:contrast-[1.1]",
                muted && "opacity-80 saturate-[0.25] dark:opacity-60 dark:brightness-[0.7]",
              )}
              style={{ left: tile.x, top: tile.y }}
            />
            {tile.labels && (
              <img
                src={tile.labels}
                alt=""
                width={TILE}
                height={TILE}
                loading="lazy"
                decoding="async"
                draggable={false}
                className="absolute max-w-none select-none"
                style={{ left: tile.x, top: tile.y }}
              />
            )}
          </React.Fragment>
        ))}
        <svg className="absolute inset-0" width={stripWidth} height={height} viewBox={`0 0 ${stripWidth} ${height}`}>
          {layout.shape.kind === "circle" ? (
            <circle
              cx={layout.shape.x}
              cy={layout.shape.y}
              r={layout.shape.r}
              fill={SELECTION_COLOR}
              fillOpacity={0.14}
              stroke={SELECTION_COLOR}
              strokeWidth={2}
            />
          ) : layout.shape.kind === "polygon" ? (
            <polygon
              points={layout.shape.points}
              fill={SELECTION_COLOR}
              fillOpacity={0.14}
              stroke={SELECTION_COLOR}
              strokeWidth={2}
              strokeLinejoin="round"
            />
          ) : (
            <rect
              x={layout.shape.x}
              y={layout.shape.y}
              width={layout.shape.w}
              height={layout.shape.h}
              fill={SELECTION_COLOR}
              fillOpacity={0.14}
              stroke={SELECTION_COLOR}
              strokeWidth={2}
            />
          )}
          {[...layout.dots]
            .sort((a, b) => Number(!!a.main) - Number(!!b.main))
            .map((dot, i) =>
              dot.main ? (
                <g key={i}>
                  <circle cx={dot.x} cy={dot.y} r={11} fill="none" stroke="#111" strokeOpacity={0.35} strokeWidth={2} />
                  <circle cx={dot.x} cy={dot.y} r={7} fill={dot.color} stroke="#fff" strokeWidth={2.5} />
                </g>
              ) : (
                <circle key={i} cx={dot.x} cy={dot.y} r={5} fill={dot.color} stroke="#fff" strokeWidth={1.5} />
              ),
            )}
        </svg>
      </div>
    </div>
  );
};
