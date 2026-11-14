"use client";

import React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Download,
  FileJson,
  Layers,
  Plus,
  RotateCcw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EntradasTable } from "@/components/entradas/entradas-table";
import { LocationPickerMap } from "@/components/entradas/location-picker-map";
import { findLouleParishForPoint } from "@/models/loule-parishes-geojson";
import {
  CLASSIFICACAO_VIA_LIST,
  ENTRADAS_MOCK_DATA,
  ESTADO_LIST,
  FREGUESIA_LIST,
  GESTAO_FILTER_OPTIONS,
  GRAVIDADE_LIST,
  TIPO_ANOMALIA_LIST,
  exportEntradasToCsv,
  exportEntradasToGeoJson,
  getGravidade,
  type ClassificacaoVia,
  type EntradaAnomalia,
  type EstadoEntrada,
  type GestaoCompetencia,
  type GravidadeNivel,
  type TipoAnomalia,
} from "@/models/entradas-data";

export default function EntradasPage() {
  const [entries, setEntries] = React.useState<EntradaAnomalia[]>(ENTRADAS_MOCK_DATA);

  React.useEffect(() => {
    let active = true;
    fetch("/api/anomalies", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { entradas?: EntradaAnomalia[] } | null) => {
        if (active && Array.isArray(data?.entradas) && data.entradas.length > 0) {
          setEntries(data.entradas);
        }
      })
      .catch(() => {
        // Keep initial seeded data if offline
      });
    return () => {
      active = false;
    };
  }, []);
  const [search, setSearch] = React.useState("");
  const [tipoFilter, setTipoFilter] = React.useState<string>("all");
  const [gravidadeFilter, setGravidadeFilter] = React.useState<string>("all");
  const [estadoFilter, setEstadoFilter] = React.useState<string>("all");
  const [viaFilter, setViaFilter] = React.useState<string>("all");
  const [freguesiaFilter, setFreguesiaFilter] = React.useState<string>("all");
  const [gestaoFilter, setGestaoFilter] = React.useState<string>("all");

  // Manual Entry Dialog State
  const [manualOpen, setManualOpen] = React.useState(false);
  const [newTipo, setNewTipo] = React.useState<TipoAnomalia>("Buraco no Pavimento");
  const [newRua, setNewRua] = React.useState("");
  const [newFreguesia, setNewFreguesia] =
    React.useState<EntradaAnomalia["freguesia"]>("Quarteira");
  const [newVia, setNewVia] = React.useState<ClassificacaoVia>("Urb. Arterial");
  const [newProfundidade, setNewProfundidade] = React.useState("4.5");
  const [newLat, setNewLat] = React.useState<number>(37.0715);
  const [newLng, setNewLng] = React.useState<number>(-8.1025);
  const [newNotas, setNewNotas] = React.useState("");

  const handlePickManualLocation = React.useCallback(async (lat: number, lng: number) => {
    setNewLat(lat);
    setNewLng(lng);
    const detectedParish = findLouleParishForPoint(lat, lng);
    if (detectedParish) {
      const normalized = detectedParish.replace("Loulé (", "").replace(")", "");
      setNewFreguesia(normalized);
    }

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&addressdetails=1`,
        { signal: AbortSignal.timeout(3500) },
      );
      if (res.ok) {
        const data = await res.json();
        const addr = data?.address ?? {};
        const roadName = addr.road || addr.pedestrian || addr.residential || addr.suburb;
        if (typeof roadName === "string" && roadName.trim()) {
          setNewRua(roadName.trim());
          const upper = roadName.toUpperCase();
          if (upper.includes("EN125") || upper.includes("EN 125") || upper.includes("N125")) {
            setNewVia("EN 125");
          } else if (upper.includes("MARGINAL") || upper.includes("INFANTE DE SAGRES")) {
            setNewVia("Av. Marginal");
          } else if (upper.includes("AV.") || upper.includes("AVENIDA")) {
            setNewVia("Urb. Arterial");
          } else {
            setNewVia("Rua Local");
          }
          return;
        }
      }
    } catch {
      // Offline fallback below
    }

    setNewRua((prev) =>
      prev.trim()
        ? prev
        : `Via Municipal (${detectedParish ?? "Loulé"} • ${lat.toFixed(4)}, ${lng.toFixed(4)})`,
    );
  }, []);

  const filteredEntries = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((item) => {
      if (q) {
        const hay = `${item.id} ${item.rua} ${item.freguesia} ${item.tipo}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (tipoFilter !== "all" && item.tipo !== tipoFilter) return false;
      if (
        gravidadeFilter !== "all" &&
        getGravidade(item.coberturaPct, item.areaEstimadaCm2, item.proximidadeSensivel) !==
          gravidadeFilter
      ) {
        return false;
      }
      if (estadoFilter !== "all" && item.estado !== estadoFilter) return false;
      if (viaFilter !== "all" && item.classificacaoVia !== viaFilter) return false;
      if (freguesiaFilter !== "all" && item.freguesia !== freguesiaFilter) return false;
      if (gestaoFilter !== "all") {
        const itemGestao: GestaoCompetencia = item.gestao ?? "Câmara Municipal de Loulé";
        if (itemGestao !== gestaoFilter) return false;
      }
      return true;
    });
  }, [entries, search, tipoFilter, gravidadeFilter, estadoFilter, viaFilter, freguesiaFilter, gestaoFilter]);

  const hasActiveFilters =
    search.trim() !== "" ||
    tipoFilter !== "all" ||
    gravidadeFilter !== "all" ||
    estadoFilter !== "all" ||
    viaFilter !== "all" ||
    freguesiaFilter !== "all" ||
    gestaoFilter !== "all";

  const resetFilters = () => {
    setSearch("");
    setTipoFilter("all");
    setGravidadeFilter("all");
    setEstadoFilter("all");
    setViaFilter("all");
    setFreguesiaFilter("all");
    setGestaoFilter("all");
  };

  // Top KPI Strip calculations (excluding IP / Concessão from internal municipal SLA penalties)
  const kpis = React.useMemo(() => {
    const total = entries.length;
    const municipalEntries = entries.filter(
      (e) =>
        !e.slaExempt &&
        e.gestao !== "Infraestruturas de Portugal (IP)" &&
        e.gestao !== "Concessionária (Via do Infante / Subconcessão)",
    );
    const criticasPendentes = municipalEntries.filter(
      (e) =>
        getGravidade(e.coberturaPct, e.areaEstimadaCm2, e.proximidadeSensivel) === "Crítica" &&
        e.estado === "Pendente",
    ).length;
    const areaTotalM2 = entries.reduce((acc, e) => acc + e.areaEstimadaM2, 0);
    const resolvidos = municipalEntries.filter((e) => e.estado === "Resolvido").length;
    const taxaResolucao =
      municipalEntries.length > 0
        ? Math.round((resolvidos / municipalEntries.length) * 100)
        : 0;
    return { total, criticasPendentes, areaTotalM2, taxaResolucao, resolvidos };
  }, [entries]);

  const handleStatusChange = React.useCallback((id: string, nextStatus: EstadoEntrada) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, estado: nextStatus } : e)),
    );
    void fetch(`/api/anomalies/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: nextStatus }),
    });
  }, []);

  const handleBulkStatusChange = React.useCallback(
    (ids: string[], nextStatus: EstadoEntrada) => {
      const idSet = new Set(ids);
      setEntries((prev) =>
        prev.map((e) => (idSet.has(e.id) ? { ...e, estado: nextStatus } : e)),
      );
      void fetch("/api/anomalies", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, estado: nextStatus }),
      });
    },
    [],
  );

  const handleCreateManualEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRua.trim()) {
      toast.error("Indique o nome da rua ou via.");
      return;
    }
    const depthCm = Math.min(35, Math.max(0.5, Number(newProfundidade) || 4.5));
    const estimatedAreaCm2 = Math.round(depthCm * 380);
    const cob = Math.min(8, Math.max(0.4, Number((estimatedAreaCm2 / 1400).toFixed(2))));
    const nextNum = 101 + entries.length;
    const candidate: EntradaAnomalia = {
      id: `ANM-${nextNum}-${Date.now().toString().slice(-3)}`,
      tipo: newTipo,
      confianca: 1.0,
      rua: newRua.trim(),
      freguesia: newFreguesia,
      classificacaoVia: newVia,
      coberturaPct: cob,
      profundidadeCm: depthCm,
      areaEstimadaM2: Number((estimatedAreaCm2 / 10_000).toFixed(2)),
      areaEstimadaCm2: estimatedAreaCm2,
      estado: "Pendente",
      ultimaDetecaoIso: new Date().toISOString(),
      ultimaDetecaoLabel: "14 Nov 2026, Agora",
      recorrencia: 1,
      lat: Number.isFinite(newLat) ? newLat : 37.0715,
      lng: Number.isFinite(newLng) ? newLng : -8.1025,
      viatura: "Registo Manual (Obras Públicas)",
      imagemUrl: "/api/media/assets/reference.jpg",
      thumbPosition: "50% 50%",
      bbox: { xPct: 35, yPct: 45, wPct: 30, hPct: 22, className: "manual" },
      notas: newNotas.trim() || undefined,
    };

    try {
      const res = await fetch("/api/anomalies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(candidate),
      });
      const data = await res.json();
      const saved: EntradaAnomalia = res.ok && data?.entrada ? data.entrada : candidate;
      setEntries((prev) => [saved, ...prev]);
      toast.success(`Registo #${saved.id} guardado no Supabase`);
    } catch {
      setEntries((prev) => [candidate, ...prev]);
      toast.success(`Registo #${candidate.id} adicionado localmente`);
    }

    setManualOpen(false);
    setNewRua("");
    setNewNotas("");
  };

  return (
    <main className="h-svh overflow-y-auto bg-background px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6">
        {/* Page Header */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Entradas de Anomalias
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Gestão de ocorrências detetadas por YOLOv11, gravidade estrutural e ordens de reparação municipal.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="bg-white text-slate-800 hover:bg-slate-50 dark:bg-card dark:text-foreground dark:hover:bg-accent"
              onClick={() => {
                exportEntradasToCsv(filteredEntries);
                toast.success(`${filteredEntries.length} entradas exportadas em CSV`);
              }}
            >
              <Download className="mr-1.5 size-4" />
              Exportar CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="bg-white text-slate-800 hover:bg-slate-50 dark:bg-card dark:text-foreground dark:hover:bg-accent"
              onClick={() => {
                exportEntradasToGeoJson(filteredEntries);
                toast.success(`${filteredEntries.length} entradas exportadas em GeoJSON`);
              }}
            >
              <FileJson className="mr-1.5 size-4" />
              Exportar GeoJSON
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => setManualOpen(true)}
            >
              <Plus className="mr-1.5 size-4" />
              Novo Registo Manual
            </Button>
          </div>
        </header>

        {/* Top KPI Strip (4 compact cards) */}
        <section
          aria-label="Indicadores de auditoria"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <Card className="border-border/80 py-4 shadow-xs">
            <CardContent className="flex items-center justify-between px-5">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Total de Entradas</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                  {kpis.total}
                </p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                <ClipboardList className="size-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 py-4 shadow-xs">
            <CardContent className="flex items-center justify-between px-5">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Críticas Pendentes</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-rose-600 dark:text-rose-400">
                  {kpis.criticasPendentes}
                </p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                <AlertTriangle className="size-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 py-4 shadow-xs">
            <CardContent className="flex items-center justify-between px-5">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Área Total Estimada</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                  {kpis.areaTotalM2.toFixed(2).replace(".", ",")} <span className="text-sm font-normal text-muted-foreground">m²</span>
                </p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
                <Layers className="size-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 py-4 shadow-xs">
            <CardContent className="flex items-center justify-between px-5">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Taxa de Resolução</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-emerald-600 dark:text-emerald-400">
                  {kpis.taxaResolucao}%{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({kpis.resolvidos}/{kpis.total})
                  </span>
                </p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                <CheckCircle2 className="size-5" />
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Filter Bar above Table */}
        <section
          aria-label="Filtros da tabela"
          className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border bg-card p-3 shadow-xs"
        >
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar por rua, ID ou freguesia..."
              className="h-9 pl-9 text-sm"
            />
          </div>

          <Select value={tipoFilter} onValueChange={setTipoFilter}>
            <SelectTrigger className="h-9 w-[195px] text-xs">
              <SelectValue placeholder="Tipo de Anomalia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Tipos</SelectItem>
              {TIPO_ANOMALIA_LIST.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={gravidadeFilter} onValueChange={setGravidadeFilter}>
            <SelectTrigger className="h-9 w-[145px] text-xs">
              <SelectValue placeholder="Gravidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Gravidades</SelectItem>
              {GRAVIDADE_LIST.map((g: GravidadeNivel) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={estadoFilter} onValueChange={setEstadoFilter}>
            <SelectTrigger className="h-9 w-[155px] text-xs">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Estados</SelectItem>
              {ESTADO_LIST.map((st) => (
                <SelectItem key={st} value={st}>
                  {st}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={viaFilter} onValueChange={setViaFilter}>
            <SelectTrigger className="h-9 w-[165px] text-xs">
              <SelectValue placeholder="Classificação da Via" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Vias</SelectItem>
              {CLASSIFICACAO_VIA_LIST.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={freguesiaFilter} onValueChange={setFreguesiaFilter}>
            <SelectTrigger className="h-9 w-[155px] text-xs">
              <SelectValue placeholder="Freguesia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Freguesias</SelectItem>
              {FREGUESIA_LIST.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={gestaoFilter} onValueChange={setGestaoFilter}>
            <SelectTrigger className="h-9 w-[185px] text-xs">
              <SelectValue placeholder="Gestão / Competência" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Competências</SelectItem>
              {GESTAO_FILTER_OPTIONS.map((g) => (
                <SelectItem key={g.value} value={g.value}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9 text-xs">
              <RotateCcw className="mr-1.5 size-3.5" />
              Limpar
            </Button>
          )}
        </section>

        {/* Data Table */}
        <EntradasTable
          data={filteredEntries}
          onStatusChange={handleStatusChange}
          onBulkStatusChange={handleBulkStatusChange}
        />
      </div>

      {/* + Novo Registo Manual Dialog */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <form onSubmit={handleCreateManualEntry}>
            <DialogHeader>
              <DialogTitle>Novo Registo Manual de Anomalia</DialogTitle>
              <DialogDescription>
                Coloque o pino no mapa para preencher automaticamente as coordenadas, freguesia e via.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <LocationPickerMap
                lat={newLat}
                lng={newLng}
                detectedParish={
                  newFreguesia === "São Clemente" || newFreguesia === "São Sebastião"
                    ? `Loulé (${newFreguesia})`
                    : newFreguesia
                }
                onPick={(lat, lng) => void handlePickManualLocation(lat, lng)}
              />

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="manual-lat">Latitude</Label>
                  <Input
                    id="manual-lat"
                    type="number"
                    step="0.000001"
                    value={newLat}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (Number.isFinite(val)) void handlePickManualLocation(val, newLng);
                    }}
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="manual-lng">Longitude</Label>
                  <Input
                    id="manual-lng"
                    type="number"
                    step="0.000001"
                    value={newLng}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (Number.isFinite(val)) void handlePickManualLocation(newLat, val);
                    }}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="manual-tipo">Tipo de Anomalia</Label>
                <Select value={newTipo} onValueChange={(v) => setNewTipo(v as TipoAnomalia)}>
                  <SelectTrigger id="manual-tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPO_ANOMALIA_LIST.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="manual-rua">Rua / Via</Label>
                <Input
                  id="manual-rua"
                  value={newRua}
                  onChange={(e) => setNewRua(e.target.value)}
                  placeholder="Ex.: Av. Infante de Sagres"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="manual-freguesia">Freguesia / Zona</Label>
                  <Select
                    value={newFreguesia}
                    onValueChange={(v) =>
                      setNewFreguesia(v as EntradaAnomalia["freguesia"])
                    }
                  >
                    <SelectTrigger id="manual-freguesia">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREGUESIA_LIST.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-1.5">
                  <Label htmlFor="manual-via">Classificação da Via</Label>
                  <Select
                    value={newVia}
                    onValueChange={(v) => setNewVia(v as ClassificacaoVia)}
                  >
                    <SelectTrigger id="manual-via">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CLASSIFICACAO_VIA_LIST.map((v) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="manual-profundidade">Profundidade Estimada (cm)</Label>
                <Input
                  id="manual-profundidade"
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="35"
                  value={newProfundidade}
                  onChange={(e) => setNewProfundidade(e.target.value)}
                  placeholder="Ex.: 4.5"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="manual-notas">Observações</Label>
                <Textarea
                  id="manual-notas"
                  value={newNotas}
                  onChange={(e) => setNewNotas(e.target.value)}
                  placeholder="Detalhes adicionais sobre o estado do pavimento..."
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setManualOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-emerald-600 text-white hover:bg-emerald-700">
                Guardar Registo
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
