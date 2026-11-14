"use client";

import React from "react";
import { CircleMarker, MapContainer, Polygon, TileLayer, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { LOULE_PARISH_POLYGONS } from "@/models/loule-parishes-geojson";

export interface LocationPickerMapProps {
  lat: number;
  lng: number;
  detectedParish?: string;
  onPick: (lat: number, lng: number) => void;
}

const ClickHandler: React.FC<{ onPick: (lat: number, lng: number) => void }> = ({ onPick }) => {
  useMapEvents({
    click(e) {
      onPick(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
    },
  });
  return null;
};

const RecenterHelper: React.FC<{ lat: number; lng: number }> = ({ lat, lng }) => {
  const map = useMap();
  React.useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.panTo([lat, lng], { animate: true });
    }
  }, [lat, lng, map]);
  return null;
};

export const LocationPickerMapInner: React.FC<LocationPickerMapProps> = ({
  lat,
  lng,
  detectedParish,
  onPick,
}) => {
  const parishPolys = detectedParish ? LOULE_PARISH_POLYGONS[detectedParish] : undefined;

  return (
    <div className="relative h-52 w-full overflow-hidden rounded-xl border border-border">
      <MapContainer
        center={[lat, lng]}
        zoom={13}
        zoomControl={false}
        attributionControl={false}
        className="h-full w-full cursor-crosshair"
      >
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
        {parishPolys?.map((ring, idx) => (
          <Polygon
            key={`${detectedParish}-${idx}`}
            positions={ring}
            pathOptions={{
              color: "#f59e0b",
              weight: 2,
              dashArray: "6 4",
              fillColor: "#f59e0b",
              fillOpacity: 0.08,
              interactive: false,
            }}
          />
        ))}
        <CircleMarker
          center={[lat, lng]}
          radius={8}
          pathOptions={{
            color: "#ffffff",
            weight: 2.5,
            fillColor: "#10b981",
            fillOpacity: 1,
          }}
        />
        <ClickHandler onPick={onPick} />
        <RecenterHelper lat={lat} lng={lng} />
      </MapContainer>
      <div className="pointer-events-none absolute bottom-2 left-2 z-[400] rounded-lg bg-slate-950/80 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-xs">
        Clique no mapa para colocar o pino e preencher automaticamente
      </div>
    </div>
  );
};
