"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

export interface PinDropperMapProps {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
}

const pinIcon = L.divIcon({
  className: "siri-citizen-pin",
  html: `
    <div style="
      width: 28px;
      height: 28px;
      border-radius: 9999px 9999px 9999px 0;
      background: #10b981;
      border: 3px solid #ffffff;
      box-shadow: 0 6px 16px rgba(5, 150, 105, 0.45);
      transform: rotate(-45deg);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="
        width: 8px;
        height: 8px;
        border-radius: 9999px;
        background: #ffffff;
        transform: rotate(45deg);
      "></div>
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
});

function MapViewportSync({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 16), { animate: true });
  }, [lat, lng, map]);
  return null;
}

function ClickAndDragMarker({ lat, lng, onChange }: PinDropperMapProps) {
  const markerRef = useRef<L.Marker | null>(null);

  useMapEvents({
    click(event) {
      onChange(
        Number(event.latlng.lat.toFixed(6)),
        Number(event.latlng.lng.toFixed(6)),
      );
    },
  });

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (!marker) return;
        const pos = marker.getLatLng();
        onChange(Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6)));
      },
    }),
    [onChange],
  );

  return (
    <Marker
      draggable
      position={[lat, lng]}
      icon={pinIcon}
      ref={markerRef}
      eventHandlers={eventHandlers}
    />
  );
}

export function PinDropperMapInner({ lat, lng, onChange }: PinDropperMapProps) {
  return (
    <div className="relative h-64 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <MapContainer
        center={[lat, lng]}
        zoom={16}
        scrollWheelZoom
        className="h-full w-full z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapViewportSync lat={lat} lng={lng} />
        <ClickAndDragMarker lat={lat} lng={lng} onChange={onChange} />
      </MapContainer>
      <div className="pointer-events-none absolute bottom-2 left-2 z-[400] rounded-lg bg-white/90 px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-sm backdrop-blur">
        Toque no mapa ou arraste o pino para ajustar o local exato
      </div>
    </div>
  );
}
