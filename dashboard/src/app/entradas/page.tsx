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
import {
  CLASSIFICACAO_VIA_LIST,
  ENTRADAS_MOCK_DATA,
  ESTADO_LIST,
  GRAVIDADE_LIST,
  TIPO_ANOMALIA_LIST,
  exportEntradasToCsv,
  exportEntradasToGeoJson,
  getGravidade,
  type ClassificacaoVia,
  type EntradaAnomalia,
  type EstadoEntrada,
  type GravidadeNivel,
  type TipoAnomalia,
} from "@/models/entradas-data";

export default function EntradasPage() {
  const [entries, setEntries] = React.useState<EntradaAnomalia[]>(ENTRADAS_MOCK_DATA);
  const [search, setSearch] = React.useState("");
  const [tipoFilter, setTipoFilter] = React.useState<string>("all");
  const [gravidadeFilter, setGravidadeFilter] = React.useState<string>("all");
  const [estadoFilter, setEstadoFilter] = React.useState<string>("all");
  const [viaFilter, setViaFilter] = React.useState<string>("all");

  // Manual Entry Dialog State
  const [manualOpen, setManualOpen] = React.useState(false);
  const [newTipo, setNewTipo] = React.useState<TipoAnomalia>("Buraco no Pavimento");
  const [newRua, setNewRua] = React.useState("");
  const [newFreguesia, setNewFreguesia] =
    React.useState<EntradaAnomalia["freguesia"]>("Quarteira");
  const [newVia, setNewVia] = React.useState<ClassificacaoVia>("Urb. Arterial");
  const [newCobertura, setNewCobertura] = React.useState("2.10");
  const [newNotas, setNewNotas] = React.useState("");

  const filteredEntries = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((item) => {
      if (q) {
        const hay = `${item.id} ${item.rua} ${item.freguesia} ${item.tipo}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (tipoFilter !== "all" && item.tipo !== tipoFilter) return false;
      if (gravidadeFilter !== "all" && getGravidade(item.coberturaPct) !== gravidadeFilter) {
        return false;
      }
      if (estadoFilter !== "all" && item.estado !== estadoFilter) return false;
      if (viaFilter !== "all" && item.classificacaoVia !== viaFilter) return false;
      return true;
    });
  }, [entries, search, tipoFilter, gravidadeFilter, estadoFilter, viaFilter]);

  const hasActiveFilters =
    search.trim() !== "" ||
    tipoFilter !== "all" ||
    gravidadeFilter !== "all" ||
    estadoFilter !== "all" ||
    viaFilter !== "all";

  const resetFilters = () => {
    setSearch("");
    setTipoFilter("all");
    setGravidadeFilter("all");
    setEstadoFilter("all");
    setViaFilter("all");
  };

  // Top KPI Strip calculations
  const kpis = React.useMemo(() => {
    const total = entries.length;
    const criticasPendentes = entries.filter(
      (e) => getGravidade(e.coberturaPct) === "Crítica" && e.estado === "Pendente",
    ).length;
    const areaTotalM2 = entries.reduce((acc, e) => acc + e.areaEstimadaM2, 0);
    const resolvidos = entries.filter((e) => e.estado === "Resolvido").length;
    const taxaResolucao = total > 0 ? Math.round((resolvidos / total) * 100) : 0;
    return { total, criticasPendentes, areaTotalM2, taxaResolucao, resolvidos };
  }, [entries]);

  const handleStatusChange = React.useCallback((id: string, nextStatus: EstadoEntrada) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, estado: nextStatus } : e)),
    );
  }, []);

  const handleBulkStatusChange = React.useCallback(
    (ids: string[], nextStatus: EstadoEntrada) => {
      const idSet = new Set(ids);
      setEntries((prev) =>
        prev.map((e) => (idSet.has(e.id) ? { ...e, estado: nextStatus } : e)),
      );
    },
    [],
  );

  const handleCreateManualEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRua.trim()) {
      toast.error("Indique o nome da rua ou via.");
      return;
    }
    const cob = Math.min(8, Math.max(0.2, Number(newCobertura) || 1.5));
    const nextNum = 101 + entries.length;
    const created: EntradaAnomalia = {
      id: `ANM-${nextNum}`,
      tipo: newTipo,
      confianca: 1.0,
      rua: newRua.trim(),
      freguesia: newFreguesia,
      classificacaoVia: newVia,
      coberturaPct: Number(cob.toFixed(2)),
      areaEstimadaM2: Number((cob * 0.14).toFixed(2)),
      estado: "Pendente",
      ultimaDetecaoIso: new Date().toISOString(),
      ultimaDetecaoLabel: "14 Nov 2026, Agora",
      recorrencia: 1,
      lat: 37.0715,
      lng: -8.1025,
      viatura: "Registo Manual (Obras Públicas)",
      imagemUrl: "/assets/reference.jpg",
      thumbPosition: "50% 50%",
      bbox: { xPct: 35, yPct: 45, wPct: 30, hPct: 22, className: "manual" },
      notas: newNotas.trim() || undefined,
    };
    setEntries((prev) => [created, ...prev]);
    toast.success(`Registo #${created.id} adicionado à lista`);
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
        <DialogContent className="max-w-md">
          <form onSubmit={handleCreateManualEntry}>
            <DialogHeader>
              <DialogTitle>Novo Registo Manual de Anomalia</DialogTitle>
              <DialogDescription>
                Registe manualmente uma ocorrência comunicada por munícipes ou equipas de terreno.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
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
                      <SelectItem value="Quarteira">Quarteira</SelectItem>
                      <SelectItem value="Vilamoura">Vilamoura</SelectItem>
                      <SelectItem value="Almancil">Almancil</SelectItem>
                      <SelectItem value="Loulé">Loulé</SelectItem>
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
                <Label htmlFor="manual-cobertura">Cobertura Estimada (%)</Label>
                <Input
                  id="manual-cobertura"
                  type="number"
                  step="0.05"
                  min="0.2"
                  max="8"
                  value={newCobertura}
                  onChange={(e) => setNewCobertura(e.target.value)}
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
