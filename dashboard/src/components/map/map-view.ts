import L from "leaflet";

/** Space kept clear around a fitted area, inside whatever the page's cards leave of the map. */
export const FIT_PAD = 40;

export interface MapCover {
  top?: number;
  right?: number;
  left?: number;
  bottom?: number;
}

export const bringIntoView = (map: L.Map, bounds: L.LatLngBounds, cover: MapCover = {}) => {
  const size = map.getSize();
  const sides = size.x - (cover.left ?? 0) - (cover.right ?? 0) < 240;
  const left = FIT_PAD + (sides ? 0 : (cover.left ?? 0));
  const right = FIT_PAD + (sides ? 0 : (cover.right ?? 0));
  const rows = size.y - (cover.top ?? 0) - (cover.bottom ?? 0) < 240;
  const top = rows ? FIT_PAD : Math.max(FIT_PAD, cover.top ?? 0);
  const bottom = FIT_PAD + (rows ? 0 : (cover.bottom ?? 0));
  const view = { left, top, right: size.x - right, bottom: size.y - bottom };
  const nw = map.latLngToContainerPoint(bounds.getNorthWest());
  const se = map.latLngToContainerPoint(bounds.getSouthEast());
  if (nw.x >= view.left && nw.y >= view.top && se.x <= view.right && se.y <= view.bottom) return;
  if (se.x - nw.x > view.right - view.left || se.y - nw.y > view.bottom - view.top) {
    map.fitBounds(bounds, { paddingTopLeft: [left, top], paddingBottomRight: [right, bottom], maxZoom: map.getZoom() });
    return;
  }
  const dx = nw.x < view.left ? nw.x - view.left : se.x > view.right ? se.x - view.right : 0;
  const dy = nw.y < view.top ? nw.y - view.top : se.y > view.bottom ? se.y - view.bottom : 0;
  map.panBy([dx, dy]);
};
