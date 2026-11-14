"use client";

import * as React from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

interface MvtPointFeature {
  x: number;
  y: number;
  extent: number;
  severity?: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  Crítica: "#ef4444",
  Alta: "#f97316",
  Média: "#eab308",
  Baixa: "#14b8a6",
};

function readVarint(buf: Uint8Array, state: { pos: number }): number {
  let result = 0;
  let shift = 0;
  while (state.pos < buf.length) {
    const b = buf[state.pos++];
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return result >>> 0;
}

function zigzagDecode(n: number): number {
  return (n >>> 1) ^ -(n & 1);
}

function skipField(buf: Uint8Array, wireType: number, state: { pos: number }) {
  if (wireType === 0) {
    readVarint(buf, state);
  } else if (wireType === 1) {
    state.pos += 8;
  } else if (wireType === 2) {
    const len = readVarint(buf, state);
    state.pos += len;
  } else if (wireType === 5) {
    state.pos += 4;
  }
}

function parseValueMessage(buf: Uint8Array): string | undefined {
  const state = { pos: 0 };
  while (state.pos < buf.length) {
    const tag = readVarint(buf, state);
    const field = tag >>> 3;
    const wire = tag & 0x7;
    if (field === 1 && wire === 2) {
      const len = readVarint(buf, state);
      const slice = buf.subarray(state.pos, state.pos + len);
      state.pos += len;
      return new TextDecoder().decode(slice);
    }
    skipField(buf, wire, state);
  }
  return undefined;
}

function parseMvtPointFeatures(buffer: ArrayBuffer): MvtPointFeature[] {
  const bytes = new Uint8Array(buffer);
  const root = { pos: 0 };
  const out: MvtPointFeature[] = [];

  while (root.pos < bytes.length) {
    const tag = readVarint(bytes, root);
    const field = tag >>> 3;
    const wire = tag & 0x7;
    if (field === 3 && wire === 2) {
      const layerLen = readVarint(bytes, root);
      const layerBytes = bytes.subarray(root.pos, root.pos + layerLen);
      root.pos += layerLen;

      let extent = 4096;
      const keys: string[] = [];
      const values: (string | undefined)[] = [];
      const rawFeatures: Uint8Array[] = [];

      const lState = { pos: 0 };
      while (lState.pos < layerBytes.length) {
        const lTag = readVarint(layerBytes, lState);
        const lField = lTag >>> 3;
        const lWire = lTag & 0x7;
        if (lField === 2 && lWire === 2) {
          rawFeatures.push(layerBytes.subarray(lState.pos, lState.pos + readVarint(layerBytes, lState)));
          lState.pos += rawFeatures[rawFeatures.length - 1].length;
        } else if (lField === 3 && lWire === 2) {
          const len = readVarint(layerBytes, lState);
          keys.push(new TextDecoder().decode(layerBytes.subarray(lState.pos, lState.pos + len)));
          lState.pos += len;
        } else if (lField === 4 && lWire === 2) {
          const len = readVarint(layerBytes, lState);
          values.push(parseValueMessage(layerBytes.subarray(lState.pos, lState.pos + len)));
          lState.pos += len;
        } else if (lField === 5 && lWire === 0) {
          extent = readVarint(layerBytes, lState) || 4096;
        } else {
          skipField(layerBytes, lWire, lState);
        }
      }

      const severityKeyIdx = keys.indexOf("severity");
      for (const feat of rawFeatures) {
        const fState = { pos: 0 };
        let geomType = 0;
        const geomInts: number[] = [];
        const tags: number[] = [];

        while (fState.pos < feat.length) {
          const fTag = readVarint(feat, fState);
          const fField = fTag >>> 3;
          const fWire = fTag & 0x7;
          if (fField === 2 && fWire === 2) {
            const len = readVarint(feat, fState);
            const end = fState.pos + len;
            while (fState.pos < end) tags.push(readVarint(feat, fState));
          } else if (fField === 3 && fWire === 0) {
            geomType = readVarint(feat, fState);
          } else if (fField === 4 && fWire === 2) {
            const len = readVarint(feat, fState);
            const end = fState.pos + len;
            while (fState.pos < end) geomInts.push(readVarint(feat, fState));
          } else {
            skipField(feat, fWire, fState);
          }
        }

        if (geomType === 1 && geomInts.length >= 3) {
          let severity: string | undefined;
          if (severityKeyIdx >= 0) {
            for (let i = 0; i + 1 < tags.length; i += 2) {
              if (tags[i] === severityKeyIdx) {
                severity = values[tags[i + 1]];
                break;
              }
            }
          }
          const x = zigzagDecode(geomInts[1]);
          const y = zigzagDecode(geomInts[2]);
          out.push({ x, y, extent, severity });
        }
      }
    } else {
      skipField(bytes, wire, root);
    }
  }
  return out;
}

export const MvtTileLayer: React.FC<{ enabled: boolean }> = ({ enabled }) => {
  const map = useMap();

  React.useEffect(() => {
    if (!enabled) return;

    const Grid = L.GridLayer.extend({
      createTile(coords: L.Coords, done: L.DoneCallback) {
        const tile = document.createElement("canvas");
        const size = this.getTileSize();
        tile.width = size.x;
        tile.height = size.y;

        const controller = new AbortController();
        fetch(`/api/tiles/anomalies/${coords.z}/${coords.x}/${coords.y}.pbf`, {
          signal: controller.signal,
        })
          .then(async (res) => {
            if (res.status === 204 || !res.ok) {
              done(undefined, tile);
              return;
            }
            const buf = await res.arrayBuffer();
            const features = parseMvtPointFeatures(buf);
            const ctx = tile.getContext("2d");
            if (ctx && features.length > 0) {
              for (const feat of features) {
                const px = (feat.x / feat.extent) * size.x;
                const py = (feat.y / feat.extent) * size.y;
                const color = SEVERITY_COLORS[feat.severity ?? ""] ?? "#0f9488";
                ctx.beginPath();
                ctx.arc(px, py, 5, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = "#ffffff";
                ctx.stroke();
              }
            }
            done(undefined, tile);
          })
          .catch(() => {
            done(undefined, tile);
          });

        return tile;
      },
    });

    const layer = new (Grid as unknown as { new (opts?: L.GridLayerOptions): L.GridLayer })({
      tileSize: 256,
      zIndex: 450,
    });
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [enabled, map]);

  return null;
};
