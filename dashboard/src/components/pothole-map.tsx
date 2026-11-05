"use client"

import * as React from "react"
import type L from "leaflet"
import type { PotholeRecord } from "@/types/pothole"

interface PotholeMapProps {
  potholes: PotholeRecord[]
  selectedId: string | null
  onSelectPothole: (pothole: PotholeRecord) => void
  mapStyle?: "dark" | "streets" | "light"
}

export function PotholeMap({
  potholes,
  selectedId,
  onSelectPothole,
  mapStyle = "dark",
}: PotholeMapProps) {
  const mapContainerRef = React.useRef<HTMLDivElement>(null)
  const mapInstanceRef = React.useRef<L.Map | null>(null)
  const markersLayerRef = React.useRef<L.LayerGroup | null>(null)
  const [isLoaded, setIsLoaded] = React.useState(false)

  // Initialize Leaflet Map once
  React.useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return

    let isMounted = true

    import("leaflet").then((L) => {
      if (!isMounted || !mapContainerRef.current || mapInstanceRef.current) return

      // Default center: Loulé Municipal Center
      const map = L.map(mapContainerRef.current, {
        center: [37.1386, -8.0227],
        zoom: 12,
        zoomControl: false,
        attributionControl: false,
      })

      // Position zoom controls at top right
      L.control.zoom({ position: "topright" }).addTo(map)

      // Tile layer: CartoDB Dark Matter for sleek modern municipal look
      const tileUrl =
        mapStyle === "streets"
          ? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          : mapStyle === "light"
            ? "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"

      const subdomains =
        mapStyle === "streets" ? ["a", "b", "c"] : ["a", "b", "c", "d"]

      L.tileLayer(tileUrl, {
        maxZoom: 19,
        subdomains,
      }).addTo(map)

      // Add attribution in small unobtrusive font
      L.control
        .attribution({ position: "bottomright", prefix: false })
        .addAttribution("© OpenStreetMap · SIRI-DL CM Loulé")
        .addTo(map)

      const markersGroup = L.layerGroup().addTo(map)
      markersLayerRef.current = markersGroup
      mapInstanceRef.current = map
      setIsLoaded(true)
    })

    return () => {
      isMounted = false
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [mapStyle])

  // Update markers when potholes or selectedId change
  React.useEffect(() => {
    const markersGroup = markersLayerRef.current
    if (!isLoaded || !mapInstanceRef.current || !markersGroup) return

    import("leaflet").then((L) => {
      markersGroup.clearLayers()

      potholes.forEach((pothole) => {
        const isSelected = pothole.id === selectedId
        const isRepaired = pothole.status === "reparado"
        const isCritical = pothole.severity === "critica" && !isRepaired

        // Color coding
        const bgColor = isRepaired
          ? "#10b981"
          : pothole.severity === "critica"
            ? "#ef4444"
            : pothole.severity === "alta"
              ? "#f97316"
              : pothole.severity === "media"
                ? "#eab308"
                : "#06b6d4"

        const pulseClass = isCritical ? "pothole-marker-critica" : ""
        const borderRing = isSelected
          ? "ring-4 ring-white ring-offset-2 ring-offset-black scale-125 z-50"
          : "hover:scale-110"

        const iconHtml = `
          <div class="relative flex items-center justify-center cursor-pointer transition-transform duration-150 ${borderRing}">
            <div class="${pulseClass} flex items-center justify-center rounded-full shadow-lg" 
                 style="background-color: ${bgColor}; width: ${isSelected ? 36 : 28}px; height: ${isSelected ? 36 : 28}px; border: 2px solid #ffffff;">
              <span style="color: #ffffff; font-weight: 800; font-size: ${isSelected ? 13 : 11}px; line-height: 1;">
                ${isRepaired ? "✓" : pothole.severity === "critica" ? "!" : "•"}
              </span>
            </div>
            ${
              isSelected
                ? `<div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45" style="background-color: ${bgColor};"></div>`
                : ""
            }
          </div>
        `

        const customIcon = L.divIcon({
          html: iconHtml,
          className: "pothole-leaflet-marker",
          iconSize: [isSelected ? 36 : 28, isSelected ? 36 : 28],
          iconAnchor: [isSelected ? 18 : 14, isSelected ? 18 : 14],
        })

        const marker = L.marker([pothole.lat, pothole.lng], { icon: customIcon })

        // Rich popup content
        const popupHtml = `
          <div style="font-family: system-ui, sans-serif; min-width: 200px; color: #0f172a; padding: 2px;">
            <div style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: ${bgColor}; margin-bottom: 2px;">
              ${pothole.id} · ${pothole.severity.toUpperCase()}
            </div>
            <div style="font-size: 13px; font-weight: 600; line-height: 1.3; margin-bottom: 4px;">
              ${pothole.road}
            </div>
            <div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">
              ${pothole.parish} · ${pothole.detectedAt}
            </div>
            <div style="display: flex; gap: 8px; font-size: 11px; background: #f1f5f9; padding: 4px 6px; border-radius: 4px; font-weight: 600;">
              <span>Área: ${pothole.areaPercentage}%</span>
              <span>Prof.: ~${pothole.estimatedDepthCm}cm</span>
            </div>
          </div>
        `
        marker.bindPopup(popupHtml, { closeButton: false, offset: [0, -10] })

        marker.on("click", () => {
          onSelectPothole(pothole)
        })

        marker.addTo(markersGroup)
      })
    })
  }, [potholes, selectedId, isLoaded, onSelectPothole])

  // Fly to selected pothole when changed
  React.useEffect(() => {
    if (!mapInstanceRef.current || !selectedId) return
    const target = potholes.find((p) => p.id === selectedId)
    if (target) {
      mapInstanceRef.current.flyTo([target.lat, target.lng], 15, {
        duration: 1.2,
      })
    }
  }, [selectedId, potholes])

  const handleResetView = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([37.1386, -8.0227], 12, { duration: 1 })
    }
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border bg-card shadow-sm">
      <div ref={mapContainerRef} className="h-full w-full" />

      {/* Floating Map Controls at Bottom-Left */}
      <div className="absolute bottom-4 left-4 z-[400] flex flex-wrap items-center gap-2 rounded-lg bg-background/90 p-1.5 shadow-md backdrop-blur-md border text-xs">
        <button
          type="button"
          onClick={handleResetView}
          className="flex items-center gap-1.5 rounded px-2.5 py-1 font-medium hover:bg-muted transition-colors text-foreground"
        >
          <span>🎯</span>
          <span>Centrar em Loulé</span>
        </button>
        <div className="h-3.5 w-px bg-border" />
        <div className="flex items-center gap-3 px-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-red-500" /> Crítica
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-orange-500" /> Alta
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-yellow-500" /> Média
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-emerald-500" /> Reparado
          </span>
        </div>
      </div>
    </div>
  )
}
