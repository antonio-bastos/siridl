export interface MapMatchResult {
  snapped: boolean;
  lat: number;
  lng: number;
  raw_lat: number;
  raw_lng: number;
  snap_distance_m: number;
  street_name: string;
  parish: string;
  road_class: string;
  osm_way_id: number | null;
}

interface OsmRoadLine {
  osm_way_id: number;
  street_name: string;
  parish: string;
  road_class: string;
  coords: [number, number][];
}

const OSM_ROAD_CENTERLINES: OsmRoadLine[] = [
  {
    osm_way_id: 10421001,
    street_name: "Av. Infante de Sagres",
    parish: "Quarteira",
    road_class: "Av. Marginal",
    coords: [[37.0684, -8.1065], [37.0689, -8.1014], [37.0695, -8.0962]],
  },
  {
    osm_way_id: 10421002,
    street_name: "Av. Sá Carneiro",
    parish: "Quarteira",
    road_class: "Urb. Arterial",
    coords: [[37.071, -8.1062], [37.0715, -8.1048], [37.0724, -8.0982]],
  },
  {
    osm_way_id: 10421003,
    street_name: "Rua Vasco da Gama",
    parish: "Quarteira",
    road_class: "Rua Local",
    coords: [[37.07, -8.107], [37.0702, -8.1056], [37.0706, -8.103]],
  },
  {
    osm_way_id: 10421004,
    street_name: "Estrada da Fonte Santa",
    parish: "Quarteira",
    road_class: "Urb. Arterial",
    coords: [[37.0672, -8.0935], [37.0648, -8.0884], [37.0628, -8.083]],
  },
  {
    osm_way_id: 10421005,
    street_name: "Av. Vilamoura XXI",
    parish: "Vilamoura",
    road_class: "Urb. Arterial",
    coords: [[37.0825, -8.1245], [37.0815, -8.1219], [37.0801, -8.1188]],
  },
  {
    osm_way_id: 10421006,
    street_name: "Av. da Marina",
    parish: "Vilamoura",
    road_class: "Av. Marginal",
    coords: [[37.0766, -8.1228], [37.0756, -8.1202], [37.0748, -8.1174]],
  },
  {
    osm_way_id: 10421008,
    street_name: "EN 125 (Km 98,4)",
    parish: "Almancil",
    road_class: "EN 125",
    coords: [[37.0958, -8.0574], [37.0861, -8.0342], [37.0815, -8.021]],
  },
  {
    osm_way_id: 10421009,
    street_name: "Av. 5 de Outubro",
    parish: "Almancil",
    road_class: "Urb. Arterial",
    coords: [[37.0878, -8.0338], [37.0872, -8.0308], [37.0866, -8.0285]],
  },
  {
    osm_way_id: 10421010,
    street_name: "Av. José da Costa Mealha",
    parish: "Loulé",
    road_class: "Urb. Arterial",
    coords: [[37.1355, -8.0238], [37.1364, -8.0205], [37.1378, -8.0178]],
  },
  {
    osm_way_id: 10421011,
    street_name: "Av. Marçal Pacheco",
    parish: "Loulé",
    road_class: "Urb. Arterial",
    coords: [[37.1386, -8.0272], [37.1394, -8.0245], [37.1401, -8.0218]],
  },
  {
    osm_way_id: 10421012,
    street_name: "Rua Primeiro de Maio",
    parish: "Loulé",
    road_class: "Rua Local",
    coords: [[37.1381, -8.0202], [37.1385, -8.0189], [37.139, -8.0174]],
  },
];

function projectPointToSegment(
  lat: number,
  lng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): { snapLat: number; snapLng: number; distM: number } {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const mPerDegLat = 111_132;
  const mPerDegLng = 111_320 * Math.max(0.1, cosLat);

  const ax = (aLng - lng) * mPerDegLng;
  const ay = (aLat - lat) * mPerDegLat;
  const bx = (bLng - lng) * mPerDegLng;
  const by = (bLat - lat) * mPerDegLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq <= 1e-9 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lenSq));

  const px = ax + t * dx;
  const py = ay + t * dy;
  return {
    snapLat: Number((lat + py / mPerDegLat).toFixed(6)),
    snapLng: Number((lng + px / mPerDegLng).toFixed(6)),
    distM: Number(Math.hypot(px, py).toFixed(2)),
  };
}

export function snapToOsmRoadFallback(
  lat: number,
  lng: number,
  maxSnapMeters = 35,
): MapMatchResult {
  let best: MapMatchResult | null = null;
  let bestDist = Infinity;

  for (const road of OSM_ROAD_CENTERLINES) {
    for (let i = 0; i < road.coords.length - 1; i += 1) {
      const [aLat, aLng] = road.coords[i];
      const [bLat, bLng] = road.coords[i + 1];
      const proj = projectPointToSegment(lat, lng, aLat, aLng, bLat, bLng);
      if (proj.distM <= maxSnapMeters && proj.distM < bestDist) {
        bestDist = proj.distM;
        best = {
          snapped: true,
          lat: proj.snapLat,
          lng: proj.snapLng,
          raw_lat: Number(lat.toFixed(6)),
          raw_lng: Number(lng.toFixed(6)),
          snap_distance_m: proj.distM,
          street_name: road.street_name,
          parish: road.parish,
          road_class: road.road_class,
          osm_way_id: road.osm_way_id,
        };
      }
    }
  }

  return (
    best ?? {
      snapped: false,
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      raw_lat: Number(lat.toFixed(6)),
      raw_lng: Number(lng.toFixed(6)),
      snap_distance_m: 0,
      street_name: "Via Municipal (Loulé)",
      parish: "Loulé",
      road_class: "Rua Local",
      osm_way_id: null,
    }
  );
}
