import L from "leaflet";

/**
 * The location picker's pin, a red take on Leaflet's stock one. The library works out the paths to its own images from the
 * script tag it was loaded by, which Next's bundling takes away, so they are given outright.
 */
export const RED_MARKER_ICON = L.icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png",
  iconRetinaUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

/** The CRM's own teardrop, drawn in `currentColor` with a hole in its head. The market map colours it per band. */
export const PIN_PATH =
  "M32,1C20.694,1,9,9.639,9,24.095C9,39.24,30.383,60.797,31.293,61.707C31.48,61.895,31.735,62,32,62 s0.52-0.105,0.707-0.293C33.617,60.797,55,39.24,55,24.095C55,9.639,43.306,1,32,1z M32,32c-4.418,0-8-3.582-8-8s3.582-8,8-8 s8,3.582,8,8S36.418,32,32,32z";

/**
 * One of our listings on the listings / dashboard map: the teardrop in green (`--map-ours`), as our listings are on the
 * market map, with its drop-in and hover lift (`.market-pin--ours` in globals.css).
 */
export const LISTING_PIN_ICON = L.divIcon({
  className: "market-pin market-pin--ours",
  html: `<svg viewBox="0 0 64 64" width="30" height="38" aria-hidden="true"><path d="${PIN_PATH}" fill="currentColor" stroke="#fff" stroke-width="2.5" /></svg>`,
  iconSize: [30, 38],
  iconAnchor: [15, 38],
  popupAnchor: [0, -36],
});
