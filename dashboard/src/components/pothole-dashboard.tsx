"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CompassIcon,
  DownloadIcon,
  ExternalLinkIcon,
  HardHatIcon,
  LayersIcon,
  MapPinIcon,
  RefreshCwIcon,
  SearchIcon,
  TruckIcon,
  XIcon,
} from "lucide-react"

import { DUMMY_POTHOLES, getMunicipalStats } from "@/lib/potholes-data"
import type { PotholeRecord, PotholeStatus } from "@/types/pothole"
import { Badge } from "@/components/reui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PotholeMap } from "@/components/pothole-map"

export function PotholeDashboard() {
  const [potholes, setPotholes] = React.useState<PotholeRecord[]>(DUMMY_POTHOLES)
  const [selectedId, setSelectedId] = React.useState<string | null>("BUR-2026-001")
  const [severityFilter, setSeverityFilter] = React.useState<string>("all")
  const [statusFilter, setStatusFilter] = React.useState<string>("all")
  const [parishFilter, setParishFilter] = React.useState<string>("all")
  const [searchQuery, setSearchQuery] = React.useState<string>("")
  const [viewMode, setViewMode] = React.useState<"map" | "list">("map")
  const [mapStyle, setMapStyle] = React.useState<"dark" | "streets" | "light">("dark")

  // Dispatch modal state
  const [dispatchModalOpen, setDispatchModalOpen] = React.useState(false)
  const [dispatchCrew, setDispatchCrew] = React.useState(
    "Equipa de Conservação Rodoviária Loulé Sul"
  )
  const [dispatchMaterial, setDispatchMaterial] = React.useState(
    "Massa Asfáltica a Quente (CBUQ)"
  )
  const [dispatchPriority, setDispatchPriority] = React.useState("Urgente (Hoje)")
  const [dispatchNotes, setDispatchNotes] = React.useState("")

  const stats = React.useMemo(() => getMunicipalStats(potholes), [potholes])

  const selectedPothole = React.useMemo(() => {
    return potholes.find((p) => p.id === selectedId) || null
  }, [potholes, selectedId])

  // Filtered potholes list
  const filteredPotholes = React.useMemo(() => {
    return potholes.filter((p) => {
      if (severityFilter !== "all" && p.severity !== severityFilter) return false
      if (statusFilter !== "all" && p.status !== statusFilter) return false
      if (parishFilter !== "all" && !p.parish.toLowerCase().includes(parishFilter.toLowerCase()))
        return false
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchesRoad = p.road.toLowerCase().includes(query)
        const matchesId = p.id.toLowerCase().includes(query)
        const matchesParish = p.parish.toLowerCase().includes(query)
        if (!matchesRoad && !matchesId && !matchesParish) return false
      }
      return true
    })
  }, [potholes, severityFilter, statusFilter, parishFilter, searchQuery])

  // Parishes list
  const parishes = [
    "Todas",
    "São Clemente",
    "São Sebastião",
    "Quarteira",
    "Almancil",
    "Boliqueime",
    "Salir",
    "Querença",
    "Benafim",
  ]

  // Status cycle handler
  const handleCycleStatus = (id: string) => {
    setPotholes((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const nextStatus: PotholeStatus =
          item.status === "pendente"
            ? "em_reparacao"
            : item.status === "em_reparacao"
              ? "reparado"
              : "pendente"

        const statusLabels = {
          pendente: "Marcado como Pendente",
          em_reparacao: "Marcado em Reparação pelas Brigadas",
          reparado: "Marcado como Reparado / Alcatroado com Sucesso",
        }
        toast.info(`${item.id}: ${statusLabels[nextStatus]}`)
        return { ...item, status: nextStatus }
      })
    )
  }

  // Open dispatch modal
  const handleOpenDispatch = () => {
    if (!selectedPothole) return
    setDispatchNotes(selectedPothole.notes)
    setDispatchModalOpen(true)
  }

  // Confirm dispatch order
  const handleConfirmDispatch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPothole) return

    const orderNumber = `OP-2026-${Math.floor(100 + Math.random() * 900)}`

    setPotholes((prev) =>
      prev.map((item) => {
        if (item.id !== selectedPothole.id) return item
        return {
          ...item,
          status: "em_reparacao",
          workOrderId: orderNumber,
          assignedCrew: dispatchCrew,
          notes: dispatchNotes || item.notes,
        }
      })
    )

    setDispatchModalOpen(false)
    toast.success(
      `Ordem de Serviço ${orderNumber} emitida com sucesso para ${dispatchCrew}!`,
      {
        description: `Localização: ${selectedPothole.road}`,
      }
    )
  }

  // Copy GPS Coordinates
  const handleCopyGps = (lat: number, lng: number) => {
    navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`)
    toast.success("Coordenadas GPS copiadas para a área de transferência", {
      description: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
    })
  }

  // Export CSV
  const handleExportCsv = () => {
    const headers = [
      "ID",
      "Estrada",
      "Freguesia",
      "Latitude",
      "Longitude",
      "Gravidade",
      "Confianca_IA",
      "Area_Percentagem",
      "Profundidade_Estimada_cm",
      "Estado",
      "Detetado_Em",
      "Viatura",
      "Notas",
    ]

    const rows = filteredPotholes.map((p) => [
      p.id,
      `"${p.road.replace(/"/g, '""')}"`,
      `"${p.parish}"`,
      p.lat,
      p.lng,
      p.severity,
      p.confidence,
      p.areaPercentage,
      p.estimatedDepthCm,
      p.status,
      `"${p.detectedAt}"`,
      `"${p.vehicleId} - ${p.vehicleType}"`,
      `"${p.notes.replace(/"/g, '""')}"`,
    ])

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n")

    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `buracos_loule_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast.success("Relatório CSV de Buracos descarregado com sucesso!")
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground antialiased selection:bg-primary/20">
      {/* ==================================================================== */}
      {/* TOP BAR: MUNICIPAL BRANDING & ACTIONS                                */}
      {/* ==================================================================== */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur-md">
        <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between lg:px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <CompassIcon className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight sm:text-lg">
                  SIRI-DL · Mapa de Buracos Rodoviários
                </h1>
                <Badge variant="outline" className="text-[11px] font-semibold text-emerald-500 border-emerald-500/30">
                  <span className="mr-1 inline-block size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  CM Loulé
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Deteção Automática por Inteligência Artificial a bordo das Viaturas Municipais
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Switcher */}
            <div className="flex items-center rounded-lg border bg-muted/60 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("map")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === "map"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <CompassIcon className="size-3.5" />
                <span>Mapa Interativo</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === "list"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayersIcon className="size-3.5" />
                <span>Lista ({filteredPotholes.length})</span>
              </button>
            </div>

            {/* Map Theme Selector (only in map mode) */}
            {viewMode === "map" && (
              <div className="flex items-center rounded-lg border bg-muted/60 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setMapStyle("dark")}
                  className={`px-2 py-1 rounded ${
                    mapStyle === "dark" ? "bg-background font-semibold" : "text-muted-foreground"
                  }`}
                  title="Mapa Escuro"
                >
                  Dark
                </button>
                <button
                  type="button"
                  onClick={() => setMapStyle("streets")}
                  className={`px-2 py-1 rounded ${
                    mapStyle === "streets" ? "bg-background font-semibold" : "text-muted-foreground"
                  }`}
                  title="Mapa de Ruas"
                >
                  Ruas
                </button>
                <button
                  type="button"
                  onClick={() => setMapStyle("light")}
                  className={`px-2 py-1 rounded ${
                    mapStyle === "light" ? "bg-background font-semibold" : "text-muted-foreground"
                  }`}
                  title="Mapa Claro"
                >
                  Claro
                </button>
              </div>
            )}

            {/* Export Report */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              className="gap-1.5 text-xs font-medium"
            >
              <DownloadIcon className="size-3.5" />
              <span className="hidden sm:inline">Exportar Relatório</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ==================================================================== */}
      {/* KPI METRIC CARDS                                                     */}
      {/* ==================================================================== */}
      <section className="border-b bg-muted/20 px-4 py-3 lg:px-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* Total Detected */}
          <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-xs">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <CompassIcon className="size-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Total Sinalizados</p>
              <p className="text-xl font-bold tracking-tight">{stats.totalPotholes}</p>
            </div>
          </div>

          {/* Urgent / Critical */}
          <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-xs border-red-500/30">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
              <AlertTriangleIcon className="size-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-red-500">Críticos (Urgentes)</p>
              <p className="text-xl font-bold tracking-tight text-red-500">{stats.criticalCount}</p>
            </div>
          </div>

          {/* In Repair */}
          <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-xs">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <HardHatIcon className="size-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Em Reparação</p>
              <p className="text-xl font-bold tracking-tight">{stats.inRepairCount}</p>
            </div>
          </div>

          {/* Repaired / Completed */}
          <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-xs">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <CheckCircle2Icon className="size-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Reparados este Mês</p>
              <p className="text-xl font-bold tracking-tight">{stats.repairedCount}</p>
            </div>
          </div>

          {/* Active Fleet */}
          <div className="col-span-2 sm:col-span-1 flex items-center gap-3 rounded-xl border bg-card p-3 shadow-xs">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <TruckIcon className="size-5" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Frota em Auditoria</p>
              <p className="text-xl font-bold tracking-tight">
                {stats.activeVehicles} <span className="text-xs font-normal text-muted-foreground">viaturas</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* FILTER CONTROLS BAR                                                  */}
      {/* ==================================================================== */}
      <section className="border-b bg-background px-4 py-2.5 lg:px-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative min-w-[200px] max-w-xs">
              <SearchIcon className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Pesquisar rua, EN125, código..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="size-3" />
                </button>
              )}
            </div>

            {/* Severity Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto text-xs py-0.5">
              <span className="text-muted-foreground text-[11px] mr-1 hidden sm:inline">Gravidade:</span>
              <button
                type="button"
                onClick={() => setSeverityFilter("all")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  severityFilter === "all"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                Todas ({potholes.length})
              </button>
              <button
                type="button"
                onClick={() => setSeverityFilter("critica")}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  severityFilter === "critica"
                    ? "bg-red-500 text-white font-semibold"
                    : "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                }`}
              >
                <span className="size-1.5 rounded-full bg-red-500" />
                Crítica ({stats.criticalCount})
              </button>
              <button
                type="button"
                onClick={() => setSeverityFilter("alta")}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  severityFilter === "alta"
                    ? "bg-orange-500 text-white font-semibold"
                    : "bg-orange-500/10 text-orange-500 hover:bg-orange-500/20"
                }`}
              >
                <span className="size-1.5 rounded-full bg-orange-500" />
                Alta ({stats.highCount})
              </button>
              <button
                type="button"
                onClick={() => setSeverityFilter("media")}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  severityFilter === "media"
                    ? "bg-yellow-500 text-white font-semibold"
                    : "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20"
                }`}
              >
                <span className="size-1.5 rounded-full bg-yellow-500" />
                Média ({stats.mediumCount})
              </button>
              <button
                type="button"
                onClick={() => setSeverityFilter("baixa")}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  severityFilter === "baixa"
                    ? "bg-cyan-500 text-white font-semibold"
                    : "bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500/20"
                }`}
              >
                <span className="size-1.5 rounded-full bg-cyan-500" />
                Baixa ({stats.lowCount})
              </button>
            </div>
          </div>

          {/* Status & Parish Dropdowns */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Status Filter */}
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground text-[11px]">Estado:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="all">Todos os Estados</option>
                <option value="pendente">Pendente de Reparação ({stats.pendingCount})</option>
                <option value="em_reparacao">Em Reparação ({stats.inRepairCount})</option>
                <option value="reparado">Reparado / Concluído ({stats.repairedCount})</option>
              </select>
            </div>

            {/* Parish Filter */}
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground text-[11px]">Freguesia:</span>
              <select
                value={parishFilter}
                onChange={(e) => setParishFilter(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {parishes.map((item) => (
                  <option key={item} value={item === "Todas" ? "all" : item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================================== */}
      {/* MAIN VIEW AREA                                                       */}
      {/* ==================================================================== */}
      <main className="flex-1 p-3 lg:p-4">
        {viewMode === "map" ? (
          /* ================================================================ */
          /* SPLIT LAYOUT: MAP (LEFT) + SELECTED POTHOLE CARD (RIGHT)         */
          /* ================================================================ */
          <div className="grid h-[calc(100vh-235px)] min-h-[580px] grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Map Canvas (7 or 8 columns on desktop) */}
            <div className="h-full lg:col-span-7 xl:col-span-8">
              <PotholeMap
                potholes={filteredPotholes}
                selectedId={selectedId}
                onSelectPothole={(p) => setSelectedId(p.id)}
                mapStyle={mapStyle}
              />
            </div>

            {/* Selected Pothole Detail Side Panel (5 or 4 columns) */}
            <div className="h-full overflow-y-auto lg:col-span-5 xl:col-span-4">
              {selectedPothole ? (
                <Card className="flex h-full flex-col shadow-sm border">
                  {/* Photo with Bounding Box Overlay */}
                  <div className="relative aspect-video w-full overflow-hidden rounded-t-xl bg-slate-900 border-b">
                    {/* Dashcam Simulated Image with AI Bounding Box */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selectedPothole.imageSvg}
                      alt={`Deteção ${selectedPothole.id}`}
                      className="h-full w-full object-cover"
                    />

                    {/* Top Status Overlays */}
                    <div className="absolute left-3 top-3 flex items-center gap-2">
                      <Badge
                        className={`text-xs font-bold uppercase shadow-md ${
                          selectedPothole.severity === "critica"
                            ? "bg-red-500 text-white"
                            : selectedPothole.severity === "alta"
                              ? "bg-orange-500 text-white"
                              : selectedPothole.severity === "media"
                                ? "bg-yellow-500 text-slate-950 font-bold"
                                : "bg-cyan-500 text-white"
                        }`}
                      >
                        {selectedPothole.severity}
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="bg-black/70 text-white backdrop-blur-sm text-[11px]"
                      >
                        IA: {(selectedPothole.confidence * 100).toFixed(1)}% confiança
                      </Badge>
                    </div>

                    <div className="absolute right-3 top-3">
                      <Badge
                        className={`text-xs capitalize shadow-md ${
                          selectedPothole.status === "reparado"
                            ? "bg-emerald-500 text-white"
                            : selectedPothole.status === "em_reparacao"
                              ? "bg-amber-500 text-slate-950 font-bold"
                              : "bg-slate-700 text-white"
                        }`}
                      >
                        {selectedPothole.status === "pendente"
                          ? "Pendente"
                          : selectedPothole.status === "em_reparacao"
                            ? "Em Reparação"
                            : "Reparado"}
                      </Badge>
                    </div>
                  </div>

                  {/* Card Content & Details */}
                  <CardContent className="flex-1 space-y-4 p-4 text-xs">
                    {/* Header: Title & Road */}
                    <div>
                      <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                        <span className="font-mono font-semibold text-foreground">
                          {selectedPothole.id}
                        </span>
                        <span>{selectedPothole.detectedAt}</span>
                      </div>
                      <h2 className="mt-1 text-base font-bold leading-snug">
                        {selectedPothole.road}
                      </h2>
                      <p className="text-muted-foreground flex items-center gap-1 mt-0.5">
                        <MapPinIcon className="size-3 text-red-500" />
                        {selectedPothole.parish}, {selectedPothole.municipality}
                      </p>
                    </div>

                    {/* Physical Measurements Grid */}
                    <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/40 p-2.5 text-center">
                      <div className="rounded bg-background p-1.5 shadow-2xs">
                        <p className="text-[10px] text-muted-foreground uppercase font-medium">
                          Área na Faixa
                        </p>
                        <p className="text-sm font-bold text-foreground">
                          {selectedPothole.areaPercentage}%
                        </p>
                      </div>
                      <div className="rounded bg-background p-1.5 shadow-2xs">
                        <p className="text-[10px] text-muted-foreground uppercase font-medium">
                          Profundidade
                        </p>
                        <p className="text-sm font-bold text-red-500">
                          ~{selectedPothole.estimatedDepthCm} cm
                        </p>
                      </div>
                      <div className="rounded bg-background p-1.5 shadow-2xs">
                        <p className="text-[10px] text-muted-foreground uppercase font-medium">
                          Diâmetro
                        </p>
                        <p className="text-sm font-bold text-foreground">
                          ~{selectedPothole.estimatedDiameterCm} cm
                        </p>
                      </div>
                    </div>

                    {/* Observation / Risk Assessment */}
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
                      <p className="text-[11px] font-semibold text-amber-500 flex items-center gap-1 mb-1">
                        <AlertTriangleIcon className="size-3.5" />
                        Avaliação Técnica & Risco
                      </p>
                      <p className="text-muted-foreground leading-relaxed">
                        {selectedPothole.notes}
                      </p>
                    </div>

                    {/* Telemetry Details */}
                    <div className="space-y-1.5 border-t pt-3 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Viatura Deteção:</span>
                        <span className="font-medium text-foreground">
                          {selectedPothole.vehicleId} ({selectedPothole.vehicleType})
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Velocidade da Viatura:</span>
                        <span className="font-mono text-foreground">
                          {selectedPothole.speedKmh} km/h
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Condição Atmosférica:</span>
                        <span className="text-foreground">{selectedPothole.weather}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Coordenadas GPS:</span>
                        <button
                          type="button"
                          onClick={() => handleCopyGps(selectedPothole.lat, selectedPothole.lng)}
                          className="font-mono text-primary underline hover:text-primary/80"
                          title="Clique para copiar"
                        >
                          {selectedPothole.lat.toFixed(5)}°, {selectedPothole.lng.toFixed(5)}°
                        </button>
                      </div>
                      {selectedPothole.workOrderId && (
                        <div className="flex items-center justify-between font-semibold text-emerald-500">
                          <span>Ordem de Serviço:</span>
                          <span className="font-mono">{selectedPothole.workOrderId}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>

                  {/* Actions Footer */}
                  <CardFooter className="flex flex-col gap-2 border-t p-3 bg-muted/20">
                    <div className="flex w-full gap-2">
                      {/* Dispatch Brigade Button */}
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleOpenDispatch}
                        className="flex-1 gap-1.5 text-xs font-semibold bg-primary text-primary-foreground shadow-sm"
                      >
                        <HardHatIcon className="size-3.5" />
                        <span>Despachar Brigada</span>
                      </Button>

                      {/* Cycle Status */}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleCycleStatus(selectedPothole.id)}
                        className="gap-1.5 text-xs"
                        title="Alternar estado: Pendente -> Em Reparação -> Reparado"
                      >
                        <RefreshCwIcon className="size-3.5" />
                        <span>Alternar Estado</span>
                      </Button>
                    </div>

                    {/* Google Maps External Link */}
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${selectedPothole.lat},${selectedPothole.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-center gap-1.5 rounded-md border bg-background py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <ExternalLinkIcon className="size-3" />
                      <span>Abrir Coordenadas no Google Maps</span>
                    </a>
                  </CardFooter>
                </Card>
              ) : (
                /* Empty Selection Prompt */
                <Card className="flex h-full flex-col items-center justify-center p-6 text-center">
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground mb-3">
                    <CompassIcon className="size-8" />
                  </div>
                  <h3 className="text-base font-bold">Nenhum Buraco Selecionado</h3>
                  <p className="mt-1 text-xs text-muted-foreground max-w-xs">
                    Clique num marcador no mapa ou selecione abaixo uma das anomalias prioritárias para auditar a fotografia original da câmara.
                  </p>

                  <div className="mt-4 w-full space-y-2 text-left">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase">
                      Mais Urgentes a Intervir:
                    </p>
                    {potholes
                      .filter((p) => p.severity === "critica")
                      .slice(0, 3)
                      .map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedId(p.id)}
                          className="flex w-full items-center justify-between rounded-lg border bg-card p-2 text-xs hover:bg-muted transition-colors text-left"
                        >
                          <div>
                            <p className="font-semibold text-foreground">{p.road}</p>
                            <p className="text-[11px] text-muted-foreground">{p.parish}</p>
                          </div>
                          <Badge variant="destructive" className="text-[10px]">
                            Crítica
                          </Badge>
                        </button>
                      ))}
                  </div>
                </Card>
              )}
            </div>
          </div>
        ) : (
          /* ================================================================ */
          /* LIST / WORK ORDER VIEW                                           */
          /* ================================================================ */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold">Registo Geral de Buracos Rodoviários</h2>
                <p className="text-xs text-muted-foreground">
                  Apresentando {filteredPotholes.length} de {potholes.length} anomalias detetadas
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filteredPotholes.map((p) => (
                <Card
                  key={p.id}
                  className={`cursor-pointer overflow-hidden transition-all hover:shadow-md ${
                    selectedId === p.id ? "ring-2 ring-primary" : ""
                  }`}
                  onClick={() => {
                    setSelectedId(p.id)
                    setViewMode("map")
                  }}
                >
                  <div className="relative aspect-video w-full bg-slate-900 border-b">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.imageSvg}
                      alt={p.road}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
                      <Badge
                        className={`text-[10px] font-bold uppercase ${
                          p.severity === "critica"
                            ? "bg-red-500 text-white"
                            : p.severity === "alta"
                              ? "bg-orange-500 text-white"
                              : p.severity === "media"
                                ? "bg-yellow-500 text-slate-950 font-bold"
                                : "bg-cyan-500 text-white"
                        }`}
                      >
                        {p.severity}
                      </Badge>
                    </div>
                    <div className="absolute right-2.5 top-2.5">
                      <Badge
                        className={`text-[10px] capitalize ${
                          p.status === "reparado"
                            ? "bg-emerald-500 text-white"
                            : p.status === "em_reparacao"
                              ? "bg-amber-500 text-slate-950"
                              : "bg-slate-700 text-white"
                        }`}
                      >
                        {p.status === "pendente"
                          ? "Pendente"
                          : p.status === "em_reparacao"
                            ? "Em Reparação"
                            : "Reparado"}
                      </Badge>
                    </div>
                  </div>

                  <CardContent className="p-3 text-xs space-y-2">
                    <div>
                      <div className="flex items-center justify-between text-muted-foreground text-[10px]">
                        <span className="font-mono font-semibold">{p.id}</span>
                        <span>{p.detectedAt}</span>
                      </div>
                      <h3 className="font-bold text-foreground mt-0.5 line-clamp-1">{p.road}</h3>
                      <p className="text-muted-foreground text-[11px]">{p.parish}</p>
                    </div>

                    <div className="flex items-center justify-between rounded bg-muted/50 p-1.5 text-[11px]">
                      <span>
                        Área: <strong className="text-foreground">{p.areaPercentage}%</strong>
                      </span>
                      <span>
                        Prof.: <strong className="text-red-500">~{p.estimatedDepthCm}cm</strong>
                      </span>
                      <span>
                        IA: <strong>{(p.confidence * 100).toFixed(0)}%</strong>
                      </span>
                    </div>

                    <p className="text-[11px] text-muted-foreground line-clamp-2">{p.notes}</p>
                  </CardContent>

                  <CardFooter className="border-t p-2.5 bg-muted/20 flex items-center justify-between">
                    <span className="text-[11px] font-medium text-primary">Ver no Mapa →</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCycleStatus(p.id)
                      }}
                      className="h-7 text-xs"
                    >
                      Alterar Estado
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ==================================================================== */}
      {/* DISPATCH BRIGADE MODAL (DIALOG)                                      */}
      {/* ==================================================================== */}
      <Dialog open={dispatchModalOpen} onOpenChange={setDispatchModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary">
              <HardHatIcon className="size-5" />
              <DialogTitle>Emitir Ordem de Reparação Municipal</DialogTitle>
            </div>
            <DialogDescription>
              Atribuir reparação de pavimento à brigada de obras públicas da autarquia de Loulé.
            </DialogDescription>
          </DialogHeader>

          {selectedPothole && (
            <form onSubmit={handleConfirmDispatch} className="space-y-3.5 py-2 text-xs">
              {/* Location Summary */}
              <div className="rounded-lg border bg-muted/40 p-2.5">
                <p className="font-bold text-foreground text-sm">{selectedPothole.road}</p>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {selectedPothole.parish} · Gravidade {selectedPothole.severity.toUpperCase()}
                </p>
                <div className="mt-1.5 flex gap-3 font-mono text-[11px] text-muted-foreground">
                  <span>GPS: {selectedPothole.lat.toFixed(5)}, {selectedPothole.lng.toFixed(5)}</span>
                  <span>Profundidade: ~{selectedPothole.estimatedDepthCm} cm</span>
                </div>
              </div>

              {/* Crew Selection */}
              <div className="space-y-1">
                <Label htmlFor="crew" className="text-xs font-semibold">
                  Brigada / Piquete Designado
                </Label>
                <select
                  id="crew"
                  value={dispatchCrew}
                  onChange={(e) => setDispatchCrew(e.target.value)}
                  className="w-full h-9 rounded-md border bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="Equipa de Conservação Rodoviária Loulé Sul">
                    Equipa de Conservação Rodoviária Loulé Sul (Almancil / Quarteira)
                  </option>
                  <option value="Piquete de Obras Rápidas Loulé Centro">
                    Piquete de Obras Rápidas Loulé Centro (Área Urbana)
                  </option>
                  <option value="Brigada de Pavimentação Norte / Barrocal">
                    Brigada de Pavimentação Norte / Barrocal (Salir / Querença / Benafim)
                  </option>
                  <option value="Equipa Especial de Vias Rápidas (EN125)">
                    Equipa Especial de Vias Rápidas (EN125)
                  </option>
                </select>
              </div>

              {/* Material Selection */}
              <div className="space-y-1">
                <Label htmlFor="material" className="text-xs font-semibold">
                  Procedimento de Pavimentação
                </Label>
                <select
                  id="material"
                  value={dispatchMaterial}
                  onChange={(e) => setDispatchMaterial(e.target.value)}
                  className="w-full h-9 rounded-md border bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="Massa Asfáltica a Quente (CBUQ)">
                    Massa Asfáltica a Quente (CBUQ) com Compactação Mecânica
                  </option>
                  <option value="Mistura Betuminosa a Frio (Intervenção Imediata)">
                    Mistura Betuminosa a Frio (Intervenção Imediata de Emergência)
                  </option>
                  <option value="Fresagem e Repavimentação de Troço Completo">
                    Fresagem e Repavimentação de Troço Completo
                  </option>
                </select>
              </div>

              {/* Priority */}
              <div className="space-y-1">
                <Label htmlFor="priority" className="text-xs font-semibold">
                  Prazo de Execução
                </Label>
                <select
                  id="priority"
                  value={dispatchPriority}
                  onChange={(e) => setDispatchPriority(e.target.value)}
                  className="w-full h-9 rounded-md border bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="Urgente (Hoje)">Urgente (Executar Hoje)</option>
                  <option value="Em 24 Horas">Nas próximas 24 Horas</option>
                  <option value="Programado (Esta Semana)">Programado (No plano desta semana)</option>
                </select>
              </div>

              {/* Notes */}
              <div className="space-y-1">
                <Label htmlFor="notes" className="text-xs font-semibold">
                  Instruções para o Encarregado da Obra
                </Label>
                <Input
                  id="notes"
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                  className="h-8 text-xs"
                  placeholder="Ex.: Sinalizar via com cones antes da compactação"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDispatchModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" size="sm" className="gap-1.5 font-semibold">
                  <HardHatIcon className="size-3.5" />
                  <span>Emitir e Despachar Piquete</span>
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
