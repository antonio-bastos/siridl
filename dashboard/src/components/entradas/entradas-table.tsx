"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type TableFeatures,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useLegacyTable,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  MapPin,
  MoreHorizontal,
  Navigation,
  Route,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ESTADO_LIST,
  exportEntradasToCsv,
  exportEntradasToGeoJson,
  exportFichaTecnica,
  getGravidade,
  type EntradaAnomalia,
  type EstadoEntrada,
  type GravidadeNivel,
} from "@/models/entradas-data";

export interface EntradasTableProps {
  data: EntradaAnomalia[];
  onStatusChange: (id: string, nextStatus: EstadoEntrada) => void;
  onBulkStatusChange: (ids: string[], nextStatus: EstadoEntrada) => void;
}

const STATUS_BADGE_CLASSES: Record<EstadoEntrada, string> = {
  Pendente:
    "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800/60 dark:bg-rose-950/50 dark:text-rose-300",
  Agendado:
    "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-300",
  "Em Reparação":
    "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-800/60 dark:bg-sky-950/50 dark:text-sky-300",
  Resolvido:
    "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300",
};

const SEVERITY_STYLES: Record<
  GravidadeNivel,
  { bar: string; badge: string; stroke: string }
> = {
  Baixa: {
    bar: "bg-emerald-500",
    badge:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300",
    stroke: "#10b981",
  },
  Média: {
    bar: "bg-amber-500",
    badge:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300",
    stroke: "#f59e0b",
  },
  Crítica: {
    bar: "bg-rose-500",
    badge:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-300",
    stroke: "#ef4444",
  },
};

export function EntradasTable({
  data,
  onStatusChange,
  onBulkStatusChange,
}: EntradasTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [previewEntry, setPreviewEntry] = React.useState<EntradaAnomalia | null>(null);
  const [routeOpen, setRouteOpen] = React.useState(false);

  const columns = React.useMemo<ColumnDef<TableFeatures, EntradaAnomalia>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Selecionar todas as linhas"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label={`Selecionar ${row.original.id}`}
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: "tipo",
        header: ({ column }) => (
          <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="inline-flex items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground"
          >
            Registo / Anomalia
            <ArrowUpDown className="size-3.5" />
          </button>
        ),
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex items-center gap-3">
              {/* 48x36px rounded thumbnail replacing default folder icon */}
              <button
                type="button"
                onClick={() => setPreviewEntry(item)}
                title="Clique para ver deteção YOLOv11"
                className="group relative h-9 w-12 shrink-0 overflow-hidden rounded-md border border-border/80 bg-muted shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <img
                  src={item.imagemUrl}
                  alt={`${item.tipo} em ${item.rua}`}
                  style={{ objectPosition: item.thumbPosition }}
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-110"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
                  <Eye className="size-3.5 text-white" />
                </span>
              </button>
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {item.tipo}
                  </span>
                  <span className="inline-flex shrink-0 items-center rounded-md border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
                    #{item.id}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  YOLOv11 · {(item.confianca * 100).toFixed(1).replace(".", ",")}% conf.
                </span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "rua",
        header: "Via / Localização",
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex min-w-[180px] flex-col">
              <span className="truncate text-sm font-medium text-foreground">
                {item.rua}
              </span>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{item.freguesia}</span>
                <span>•</span>
                <span className="inline-flex items-center rounded-md border border-emerald-200/80 bg-emerald-50/70 px-1.5 py-0.25 text-[11px] font-medium text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-300">
                  {item.classificacaoVia}
                </span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "coberturaPct",
        header: ({ column }) => (
          <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="inline-flex items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground"
          >
            Gravidade
            <ArrowUpDown className="size-3.5" />
          </button>
        ),
        cell: ({ row }) => {
          const item = row.original;
          const grav = getGravidade(item.coberturaPct);
          const style = SEVERITY_STYLES[grav];
          const barWidth = Math.min(100, Math.round((item.coberturaPct / 4.0) * 100));
          return (
            <div className="flex min-w-[145px] flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.25 text-[11px] font-semibold",
                    style.badge,
                  )}
                >
                  {grav}
                </span>
                <span className="font-mono text-xs font-medium text-foreground">
                  {item.coberturaPct.toFixed(2).replace(".", ",")}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full transition-all", style.bar)}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  ~{item.areaEstimadaM2.toFixed(2).replace(".", ",")} m²
                </span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "estado",
        header: "Estado",
        cell: ({ row }) => {
          const item = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                    STATUS_BADGE_CLASSES[item.estado],
                  )}
                >
                  <span>{item.estado}</span>
                  <ChevronDown className="size-3 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Atualizar estado
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {ESTADO_LIST.map((st) => (
                  <DropdownMenuItem
                    key={st}
                    onClick={() => {
                      if (st !== item.estado) {
                        onStatusChange(item.id, st);
                        toast.success(`Registo #${item.id} atualizado para "${st}"`);
                      }
                    }}
                    className="flex items-center justify-between text-xs"
                  >
                    <span>{st}</span>
                    {item.estado === st && (
                      <CheckCircle2 className="size-3.5 text-emerald-600" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
      {
        accessorKey: "ultimaDetecaoIso",
        header: ({ column }) => (
          <button
            type="button"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="inline-flex items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground"
          >
            Recorrência & Data
            <ArrowUpDown className="size-3.5" />
          </button>
        ),
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex min-w-[175px] flex-col">
              <span className="text-sm font-medium text-foreground">
                {item.ultimaDetecaoLabel}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground">
                Detetado {item.recorrencia}x • {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
              </span>
            </div>
          );
        },
      },
      {
        id: "acoes",
        header: () => <span className="sr-only">Ações</span>,
        cell: ({ row }) => {
          const item = row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                title="Ver Imagem YOLO"
                onClick={() => setPreviewEntry(item)}
                className="text-muted-foreground hover:text-emerald-700"
              >
                <Eye className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Ver no Mapa"
                asChild
                className="text-muted-foreground hover:text-emerald-700"
              >
                <Link href={`/?lat=${item.lat}&lng=${item.lng}`}>
                  <MapPin className="size-4" />
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={`Ações para ${item.id}`}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => setPreviewEntry(item)}>
                    <Eye className="mr-2 size-4 text-emerald-600" />
                    Ver Imagem YOLO
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => router.push(`/?lat=${item.lat}&lng=${item.lng}`)}
                  >
                    <MapPin className="mr-2 size-4 text-emerald-600" />
                    Ver no Mapa
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      exportFichaTecnica(item);
                      toast.success(`Ficha técnica de #${item.id} exportada`);
                    }}
                  >
                    <FileText className="mr-2 size-4 text-muted-foreground" />
                    Exportar Ficha
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    disabled={item.estado === "Resolvido"}
                    onClick={() => {
                      onStatusChange(item.id, "Resolvido");
                      toast.success(`Registo #${item.id} marcado como Resolvido`);
                    }}
                  >
                    <CheckCircle2 className="mr-2 size-4 text-emerald-600" />
                    Marcar como Resolvido
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
        enableSorting: false,
      },
    ],
    [onStatusChange, router],
  );

  const table = useLegacyTable({
    data,
    columns,
    getRowId: (row) => row.id,
    state: {
      sorting,
      rowSelection,
    },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 10,
      },
    },
  });

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
  const selectedIds = selectedRows.map((r) => r.id);

  // Order selected rows into a north-to-south repair route for quick field dispatch
  const orderedRoute = React.useMemo(
    () => [...selectedRows].sort((a, b) => b.lat - a.lat),
    [selectedRows],
  );

  return (
    <div className="relative space-y-3">
      {/* Bulk Action Bar */}
      {selectedRows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-2.5 text-sm shadow-sm dark:border-emerald-800/60 dark:bg-emerald-950/60">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-semibold text-white">
              {selectedRows.length}
            </span>
            <span className="font-medium text-emerald-950 dark:text-emerald-100">
              {selectedRows.length === 1
                ? "1 registo selecionado"
                : `${selectedRows.length} registos selecionados`}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 border-emerald-300 bg-white dark:bg-card">
                  Alterar Estado em Massa
                  <ChevronDown className="ml-1.5 size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {ESTADO_LIST.map((st) => (
                  <DropdownMenuItem
                    key={st}
                    onClick={() => {
                      onBulkStatusChange(selectedIds, st);
                      toast.success(`${selectedIds.length} registos atualizados para "${st}"`);
                      setRowSelection({});
                    }}
                  >
                    Marcar como {st}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              className="h-8 bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => setRouteOpen(true)}
            >
              <Route className="mr-1.5 size-3.5" />
              Gerar Rota de Reparação
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="h-8 border-emerald-300 bg-white dark:bg-card"
              onClick={() => {
                exportEntradasToCsv(selectedRows, "siridl-selecionados.csv");
                toast.success(`${selectedRows.length} registos exportados em CSV`);
              }}
            >
              <Download className="mr-1.5 size-3.5" />
              Exportar Selecionados
            </Button>

            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Limpar seleção"
              onClick={() => setRowSelection({})}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ReUI c-table-8 adapted Data Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <Table>
          <TableHeader className="bg-muted/40 [&_tr]:border-b [&_tr]:border-border/70">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="h-11 border-r border-border/50 px-4 text-xs font-semibold tracking-wide text-muted-foreground last:border-r-0 [&:has([role=checkbox])]:pr-4"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="transition-colors hover:bg-emerald-50/40 data-[state=selected]:bg-emerald-50/70 dark:hover:bg-emerald-950/20 dark:data-[state=selected]:bg-emerald-950/35"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="border-r border-border/40 px-4 py-3 align-middle last:border-r-0 [&:has([role=checkbox])]:pr-4"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-sm text-muted-foreground">
                  Nenhuma anomalia encontrada com os filtros atuais.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Pagination Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
          <span>
            A mostrar{" "}
            <strong className="font-medium text-foreground">
              {table.getRowModel().rows.length}
            </strong>{" "}
            de <strong className="font-medium text-foreground">{data.length}</strong>{" "}
            {data.length === 1 ? "entrada" : "entradas"}
          </span>

          <div className="flex items-center gap-2">
            <span>
              Página {table.getState().pagination.pageIndex + 1} de{" "}
              {Math.max(1, table.getPageCount())}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Página anterior"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Página seguinte"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* YOLO Detection Preview Modal */}
      <Dialog open={!!previewEntry} onOpenChange={(open) => !open && setPreviewEntry(null)}>
        <DialogContent className="max-w-2xl">
          {previewEntry && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span>{previewEntry.tipo}</span>
                  <span className="rounded-md border border-border bg-muted px-2 py-0.5 font-mono text-xs font-medium text-muted-foreground">
                    #{previewEntry.id}
                  </span>
                </DialogTitle>
                <DialogDescription>
                  {previewEntry.rua} · {previewEntry.freguesia} ({previewEntry.classificacaoVia}) ·{" "}
                  {previewEntry.viatura}
                </DialogDescription>
              </DialogHeader>

              <div className="relative overflow-hidden rounded-xl border border-border bg-black">
                <img
                  src={previewEntry.imagemUrl}
                  alt={previewEntry.tipo}
                  className="aspect-[3/2] w-full object-cover"
                />
                {/* Responsive SVG YOLO Bounding Box Overlay */}
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-0 h-full w-full"
                >
                  <rect
                    x={previewEntry.bbox.xPct}
                    y={previewEntry.bbox.yPct}
                    width={previewEntry.bbox.wPct}
                    height={previewEntry.bbox.hPct}
                    fill="none"
                    stroke={SEVERITY_STYLES[getGravidade(previewEntry.coberturaPct)].stroke}
                    strokeWidth="0.7"
                    rx="0.6"
                  />
                </svg>
                <div
                  className="pointer-events-none absolute rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white shadow"
                  style={{
                    left: `${previewEntry.bbox.xPct}%`,
                    top: `${Math.max(2, previewEntry.bbox.yPct - 6)}%`,
                    backgroundColor:
                      SEVERITY_STYLES[getGravidade(previewEntry.coberturaPct)].stroke,
                  }}
                >
                  {previewEntry.bbox.className}{" "}
                  {(previewEntry.confianca * 100).toFixed(1)}%
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/30 p-3 text-xs sm:grid-cols-4">
                <div>
                  <p className="text-muted-foreground">Confiança YOLOv11</p>
                  <p className="mt-0.5 font-mono font-semibold text-foreground">
                    {(previewEntry.confianca * 100).toFixed(1).replace(".", ",")}%
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Cobertura / Área</p>
                  <p className="mt-0.5 font-mono font-semibold text-foreground">
                    {previewEntry.coberturaPct.toFixed(2).replace(".", ",")}% (~
                    {previewEntry.areaEstimadaM2.toFixed(2).replace(".", ",")} m²)
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Recorrência</p>
                  <p className="mt-0.5 font-semibold text-foreground">
                    Detetado {previewEntry.recorrencia}x
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Coordenadas GPS</p>
                  <p className="mt-0.5 font-mono font-semibold text-foreground">
                    {previewEntry.lat.toFixed(4)}, {previewEntry.lng.toFixed(4)}
                  </p>
                </div>
              </div>

              {previewEntry.notas && (
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">Observações:</strong> {previewEntry.notas}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    exportFichaTecnica(previewEntry);
                    toast.success(`Ficha de #${previewEntry.id} exportada`);
                  }}
                >
                  <FileText className="mr-1.5 size-3.5" />
                  Exportar Ficha
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  asChild
                >
                  <Link href={`/?lat=${previewEntry.lat}&lng=${previewEntry.lng}`}>
                    <MapPin className="mr-1.5 size-3.5" />
                    Abrir no Mapa
                  </Link>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Repair Route Generation Modal */}
      <Dialog open={routeOpen} onOpenChange={setRouteOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Navigation className="size-4 text-emerald-600" />
              Rota Otimizada de Reparação Municipal
            </DialogTitle>
            <DialogDescription>
              Itinerário sequencial para {orderedRoute.length} anomalias selecionadas no Concelho de Loulé.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {orderedRoute.map((item, idx) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 font-mono text-[11px] font-semibold text-white">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="font-medium text-foreground">
                      {item.rua} <span className="text-muted-foreground">(#{item.id})</span>
                    </p>
                    <p className="text-muted-foreground">
                      {item.freguesia} · {item.tipo} · ~{item.areaEstimadaM2.toFixed(2).replace(".", ",")} m²
                    </p>
                  </div>
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                </span>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                exportEntradasToGeoJson(orderedRoute, "siridl-rota-reparacao.geojson");
                toast.success("Rota exportada em GeoJSON");
                setRouteOpen(false);
              }}
            >
              <Download className="mr-1.5 size-3.5" />
              Exportar GeoJSON da Rota
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => {
                onBulkStatusChange(selectedIds, "Agendado");
                toast.success(`Equipa agendada para ${selectedIds.length} pontos`);
                setRouteOpen(false);
                setRowSelection({});
              }}
            >
              <CheckCircle2 className="mr-1.5 size-3.5" />
              Agendar Intervenção
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
