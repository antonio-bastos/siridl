"use client"

import * as React from "react"
import { useTable, type ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import {
  AlertTriangleIcon,
  ArrowUpRightIcon,
  BoxesIcon,
  CameraIcon,
  CheckCircle2Icon,
  CpuIcon,
  DatabaseIcon,
  DownloadIcon,
  EyeIcon,
  FileCode2Icon,
  FolderGit2Icon,
  GripVerticalIcon,
  LayersIcon,
  LayoutDashboardIcon,
  MapPinIcon,
  MoonIcon,
  NavigationIcon,
  PlayIcon,
  RadarIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  Settings2Icon,
  SlidersHorizontalIcon,
  SparklesIcon,
  SunIcon,
  TerminalIcon,
  VideoIcon,
} from "lucide-react"

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/reui/alert"
import { Badge } from "@/components/reui/badge"
import {
  CodeBlock,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockLanguage,
  CodeBlockTitle,
} from "@/components/reui/code-block/code-block"
import {
  DataGrid,
  dataGridFeatures,
  type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import { DataGridColumnVisibility } from "@/components/reui/data-grid/data-grid-column-visibility"
import { DataGridPagination } from "@/components/reui/data-grid/data-grid-pagination"
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area"
import {
  DataGridTable,
  DataGridTableFootRow,
  DataGridTableFootRowCell,
} from "@/components/reui/data-grid/data-grid-table"
import { Filters } from "@/components/reui/filters/filters"
import {
  clearFilterQuery,
  createFilterQuery,
  flattenFilterConditions,
} from "@/components/reui/filters/filters-query"
import type { FilterQuery } from "@/components/reui/filters/filters-types"
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/reui/frame"
import { IconTile } from "@/components/reui/icon-tile"
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
  KanbanColumnHandle,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
} from "@/components/reui/kanban"
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
  NumberFieldScrubArea,
} from "@/components/reui/number-field"
import {
  Stepper,
  StepperContent,
  StepperDescription,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperPanel,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@/components/reui/stepper"
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/reui/timeline"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

import {
  DATA_YAML_SNIPPET,
  DETECTION_FILTER_FIELDS,
  POSTGIS_SCHEMA_SNIPPET,
  PREDICT_CLI_SNIPPET,
  TRAIN_CLI_SNIPPET,
  ZERO_CURATION_KPIS,
  ZERO_DATASET_GROUP_RECORDS,
  ZERO_DETECTION_RECORDS,
  ZERO_EPOCH_RECORDS,
  ZERO_KANBAN_COLUMNS,
  ZERO_MODEL_CHECKPOINTS,
  ZERO_OVERVIEW_KPIS,
  ZERO_TRAINING_KPIS,
  type DashboardSectionId,
  type DatasetGroupRecord,
  type DetectionRecord,
  type EpochRecord,
  type KanbanTicket,
  type ModelCheckpointRecord,
} from "@/lib/zero-data"

interface NavSectionItem {
  id: DashboardSectionId
  label: string
  shortLabel: string
  badge: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

const NAV_SECTIONS: NavSectionItem[] = [
  {
    id: "overview",
    label: "Executive Telemetry",
    shortLabel: "Overview",
    badge: "0",
    description: "Real-time YOLOv11 anomaly telemetry & zero-baseline health",
    icon: LayoutDashboardIcon,
  },
  {
    id: "inference",
    label: "Inference & Detections",
    shortLabel: "Inference",
    badge: "0",
    description: "Dashcam stream inspector, NMS thresholds & bounding boxes",
    icon: RadarIcon,
  },
  {
    id: "training",
    label: "Model Training & Eval",
    shortLabel: "Training",
    badge: "0.00",
    description: "Loss curves, PR/F1 matrices, scale jitter & RTX VRAM metrics",
    icon: CpuIcon,
  },
  {
    id: "curation",
    label: "Dataset Curation & Mining",
    shortLabel: "Curation",
    badge: "0",
    description: "BLAKE2b deduplication, burst clustering & pseudo-label pipeline",
    icon: DatabaseIcon,
  },
  {
    id: "geospatial",
    label: "Geospatial & Dispatch",
    shortLabel: "PostGIS",
    badge: "0",
    description: "PostGIS vector coordinates & municipal maintenance Kanban",
    icon: MapPinIcon,
  },
  {
    id: "registry",
    label: "Weights & CLI Registry",
    shortLabel: "Registry",
    badge: "0 MB",
    description: "Checkpoints (best.pt / ONNX / TensorRT) & reproducible CLI runs",
    icon: BoxesIcon,
  },
]

const WORKSPACE_PROFILES = [
  {
    id: "loule-prod",
    name: "CM Loulé · Road Audit",
    checkpoint: "runs/pothole/baseline/weights/best.pt",
    environment: "CUDA:0 · RTX 40-Series (0.0 GB)",
  },
  {
    id: "yolo11s-eval",
    name: "YOLOv11s · 1280px Holdout",
    checkpoint: "weights/yolo11s.pt (Zero-Init)",
    environment: "Test Split · 0 Frames",
  },
  {
    id: "pseudo-miner",
    name: "Pseudo-Label Miner",
    checkpoint: "pseudo_dataset/ (Conf 0.00)",
    environment: "Batched GPU · 0 Workers",
  },
]

export function DashboardShell() {
  const [activeSection, setActiveSection] =
    React.useState<DashboardSectionId>("overview")
  const [selectedWorkspace, setSelectedWorkspace] = React.useState(
    WORKSPACE_PROFILES[0]
  )
  const [isDark, setIsDark] = React.useState(true)
  const [commandOpen, setCommandOpen] = React.useState(false)
  const [wizardOpen, setWizardOpen] = React.useState(false)
  const [wizardStep, setWizardStep] = React.useState(1)

  // Region state simulation controls (Empty vs Zero-Rows vs Skeleton Loading vs Error)
  const [showZeroPlaceholderRows, setShowZeroPlaceholderRows] =
    React.useState(true)
  const [isSimulatingLoad, setIsSimulatingLoad] = React.useState(false)
  const [hasSimulatedError, setHasSimulatedError] = React.useState(false)

  // Inference & Training zero-initialized numeric parameters
  const [confThreshold, setConfThreshold] = React.useState<number>(0)
  const [iouThreshold, setIouThreshold] = React.useState<number>(0)
  const [imgResolution, setImgResolution] = React.useState<number>(0)
  const [maxDetections, setMaxDetections] = React.useState<number>(0)
  const [ttaEnabled, setTtaEnabled] = React.useState<boolean>(false)
  const [fp16Enabled, setFp16Enabled] = React.useState<boolean>(false)

  // Training hyperparameters (all initialized to 0)
  const [epochsCount, setEpochsCount] = React.useState<number>(0)
  const [batchSize, setBatchSize] = React.useState<number>(0)
  const [patienceEpochs, setPatienceEpochs] = React.useState<number>(0)
  const [scaleJitter, setScaleJitter] = React.useState<number>(0)
  const [mixupProb, setMixupProb] = React.useState<number>(0)
  const [mosaicProb, setMosaicProb] = React.useState<number>(0)

  // Dataset Curation stepper & parameters (initialized to 0)
  const [curationStep, setCurationStep] = React.useState<number>(1)
  const [valRatio, setValRatio] = React.useState<number>(0)
  const [maxBurstGap, setMaxBurstGap] = React.useState<number>(0)
  const [pseudoConf, setPseudoConf] = React.useState<number>(0)

  // Filter Query for Detections DataGrid
  const [filterQuery, setFilterQuery] = React.useState<FilterQuery>(() =>
    createFilterQuery()
  )
  const [searchTerm, setSearchTerm] = React.useState("")

  // Selected row for Sheet Inspector
  const [inspectedDetection, setInspectedDetection] =
    React.useState<DetectionRecord | null>(null)

  // Kanban columns state
  const [kanbanColumns, setKanbanColumns] =
    React.useState<Record<string, KanbanTicket[]>>(ZERO_KANBAN_COLUMNS)

  // Toggle dark class on html element
  const handleToggleTheme = React.useCallback(() => {
    setIsDark((prev) => {
      const next = !prev
      if (typeof document !== "undefined") {
        document.documentElement.classList.toggle("dark", next)
      }
      return next
    })
  }, [])

  // Keyboard shortcut Cmd/Ctrl + K for Command Palette
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setCommandOpen((prev) => !prev)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const triggerLoadingPreview = React.useCallback(() => {
    setIsSimulatingLoad(true)
    setHasSimulatedError(false)
    setTimeout(() => {
      setIsSimulatingLoad(false)
      toast.success("Zero-state telemetry synchronized (all metrics = 0)")
    }, 900)
  }, [])

  const handleResetAllZero = React.useCallback(() => {
    setConfThreshold(0)
    setIouThreshold(0)
    setImgResolution(0)
    setMaxDetections(0)
    setTtaEnabled(false)
    setFp16Enabled(false)
    setEpochsCount(0)
    setBatchSize(0)
    setPatienceEpochs(0)
    setScaleJitter(0)
    setMixupProb(0)
    setMosaicProb(0)
    setValRatio(0)
    setMaxBurstGap(0)
    setPseudoConf(0)
    setFilterQuery(clearFilterQuery(filterQuery))
    setSearchTerm("")
    setHasSimulatedError(false)
    setKanbanColumns(ZERO_KANBAN_COLUMNS)
    toast.info("All model parameters, thresholds, and counters reset to 0.")
  }, [filterQuery])

  // Filtered Detection Records
  const filteredDetections = React.useMemo(() => {
    if (!showZeroPlaceholderRows) return []
    const conditions = flattenFilterConditions(filterQuery)
    return ZERO_DETECTION_RECORDS.filter((row) => {
      if (
        searchTerm.trim() !== "" &&
        !row.frameId.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !row.corridor.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !row.id.toLowerCase().includes(searchTerm.toLowerCase())
      ) {
        return false
      }
      for (const cond of conditions) {
        const val = row[cond.field as keyof DetectionRecord]
        const target = cond.values[0]
        if (target === undefined || target === "") continue
        const strVal = String(val ?? "").toLowerCase()
        const strTarget = String(target).toLowerCase()
        let matches = true
        if (cond.operator === "is") matches = strVal === strTarget
        else if (cond.operator === "is_not") matches = strVal !== strTarget
        else if (cond.operator === "contains")
          matches = strVal.includes(strTarget)
        else if (cond.operator === "not_contains")
          matches = !strVal.includes(strTarget)
        if (cond.negated) matches = !matches
        if (!matches) return false
      }
      return true
    })
  }, [showZeroPlaceholderRows, filterQuery, searchTerm])

  // Columns for Detection DataGrid (`@reui/data-grid`)
  const detectionColumns = React.useMemo<
    ColumnDef<DataGridFeatures, DetectionRecord>[]
  >(
    () => [
      {
        accessorKey: "id",
        header: ({ column }) => (
          <DataGridColumnHeader title="Record ID" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs font-medium text-foreground tabular-nums">
            {row.original.id}
          </span>
        ),
        meta: {
          headerTitle: "Record ID",
          skeleton: <Skeleton className="h-4 w-20" />,
        },
        size: 120,
      },
      {
        accessorKey: "frameId",
        header: ({ column }) => (
          <DataGridColumnHeader title="Source Frame" column={column} />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <CameraIcon
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="truncate font-mono text-xs tabular-nums">
              {row.original.frameId}
            </span>
          </div>
        ),
        meta: {
          headerTitle: "Source Frame",
          skeleton: <Skeleton className="h-4 w-32" />,
        },
        size: 185,
      },
      {
        accessorKey: "corridor",
        header: ({ column }) => (
          <DataGridColumnHeader title="Road Corridor" column={column} />
        ),
        cell: ({ row }) => (
          <span className="truncate text-xs text-muted-foreground">
            {row.original.corridor}
          </span>
        ),
        meta: {
          headerTitle: "Road Corridor",
          skeleton: <Skeleton className="h-4 w-40" />,
        },
        size: 220,
      },
      {
        accessorKey: "confidence",
        header: ({ column }) => (
          <DataGridColumnHeader title="Confidence" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.confidence.toFixed(4)} (0.0%)
          </span>
        ),
        meta: {
          headerTitle: "Confidence",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
          skeleton: <Skeleton className="h-4 w-16" />,
        },
        size: 130,
      },
      {
        accessorKey: "bbox",
        header: ({ column }) => (
          <DataGridColumnHeader title="Box (x1, y1, x2, y2)" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {row.original.bbox}
          </span>
        ),
        meta: {
          headerTitle: "Box (x1, y1, x2, y2)",
          skeleton: <Skeleton className="h-4 w-24" />,
        },
        size: 150,
      },
      {
        accessorKey: "sizePx",
        header: ({ column }) => (
          <DataGridColumnHeader title="Size (px)" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.sizePx}
          </span>
        ),
        meta: {
          headerTitle: "Size (px)",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
          skeleton: <Skeleton className="h-4 w-16" />,
        },
        size: 110,
      },
      {
        accessorKey: "areaPct",
        header: ({ column }) => (
          <DataGridColumnHeader title="Area (%)" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs font-medium tabular-nums">
            {row.original.areaPct.toFixed(3)}%
          </span>
        ),
        meta: {
          headerTitle: "Area (%)",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
          skeleton: <Skeleton className="h-4 w-16" />,
        },
        size: 110,
      },
      {
        accessorKey: "severity",
        header: ({ column }) => (
          <DataGridColumnHeader title="Severity" column={column} />
        ),
        cell: ({ row }) => (
          <Badge variant="outline">{row.original.severity} (0.00)</Badge>
        ),
        meta: {
          headerTitle: "Severity",
          skeleton: <Skeleton className="h-5 w-20" />,
        },
        size: 130,
      },
      {
        accessorKey: "speedMs",
        header: ({ column }) => (
          <DataGridColumnHeader title="Latency" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {row.original.speedMs.toFixed(1)} ms
          </span>
        ),
        meta: {
          headerTitle: "Latency",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
          skeleton: <Skeleton className="h-4 w-14" />,
        },
        size: 100,
      },
      {
        id: "actions",
        header: "Inspect",
        cell: ({ row }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              setInspectedDetection(row.original)
            }}
          >
            <EyeIcon />
            Inspect
          </Button>
        ),
        meta: {
          headerTitle: "Inspect",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end",
          skeleton: <Skeleton className="h-7 w-16" />,
        },
        size: 100,
      },
    ],
    []
  )

  const detectionTable = useTable({
    features: dataGridFeatures,
    data: hasSimulatedError ? [] : filteredDetections,
    columns: detectionColumns,
    getRowId: (row) => row.id,
    initialState: {
      pagination: { pageIndex: 0, pageSize: 10 },
    },
  })

  // Columns for Training Epoch History DataGrid
  const epochColumns = React.useMemo<
    ColumnDef<DataGridFeatures, EpochRecord>[]
  >(
    () => [
      {
        accessorKey: "epoch",
        header: ({ column }) => (
          <DataGridColumnHeader title="Epoch" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs font-medium tabular-nums">
            #{row.original.epoch} / 0
          </span>
        ),
        meta: {
          headerTitle: "Epoch",
          skeleton: <Skeleton className="h-4 w-14" />,
        },
        size: 100,
      },
      {
        accessorKey: "trainBoxLoss",
        header: ({ column }) => (
          <DataGridColumnHeader title="Train Box Loss" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.trainBoxLoss.toFixed(4)}
          </span>
        ),
        meta: {
          headerTitle: "Train Box Loss",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
          skeleton: <Skeleton className="h-4 w-16" />,
        },
        size: 130,
      },
      {
        accessorKey: "trainClsLoss",
        header: ({ column }) => (
          <DataGridColumnHeader title="Train Cls Loss" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.trainClsLoss.toFixed(4)}
          </span>
        ),
        meta: {
          headerTitle: "Train Cls Loss",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
          skeleton: <Skeleton className="h-4 w-16" />,
        },
        size: 130,
      },
      {
        accessorKey: "trainDflLoss",
        header: ({ column }) => (
          <DataGridColumnHeader title="Train DFL Loss" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.trainDflLoss.toFixed(4)}
          </span>
        ),
        meta: {
          headerTitle: "Train DFL Loss",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
          skeleton: <Skeleton className="h-4 w-16" />,
        },
        size: 130,
      },
      {
        accessorKey: "precision",
        header: ({ column }) => (
          <DataGridColumnHeader title="Precision (P)" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.precision.toFixed(4)}
          </span>
        ),
        meta: {
          headerTitle: "Precision (P)",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
          skeleton: <Skeleton className="h-4 w-16" />,
        },
        size: 130,
      },
      {
        accessorKey: "recall",
        header: ({ column }) => (
          <DataGridColumnHeader title="Recall (R)" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.recall.toFixed(4)}
          </span>
        ),
        meta: {
          headerTitle: "Recall (R)",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
          skeleton: <Skeleton className="h-4 w-16" />,
        },
        size: 120,
      },
      {
        accessorKey: "map50",
        header: ({ column }) => (
          <DataGridColumnHeader title="mAP@50" column={column} />
        ),
        cell: ({ row }) => (
          <Badge variant="info-light">
            {row.original.map50.toFixed(4)}
          </Badge>
        ),
        meta: {
          headerTitle: "mAP@50",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
          skeleton: <Skeleton className="h-5 w-16" />,
        },
        size: 120,
      },
      {
        accessorKey: "map50_95",
        header: ({ column }) => (
          <DataGridColumnHeader title="mAP@50:95" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs font-medium tabular-nums">
            {row.original.map50_95.toFixed(4)}
          </span>
        ),
        meta: {
          headerTitle: "mAP@50:95",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
          skeleton: <Skeleton className="h-4 w-16" />,
        },
        size: 120,
      },
      {
        accessorKey: "vramGb",
        header: ({ column }) => (
          <DataGridColumnHeader title="VRAM (GB)" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">
            {row.original.vramGb.toFixed(1)} GB
          </span>
        ),
        meta: {
          headerTitle: "VRAM (GB)",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
          skeleton: <Skeleton className="h-4 w-14" />,
        },
        size: 110,
      },
    ],
    []
  )

  const epochTable = useTable({
    features: dataGridFeatures,
    data: showZeroPlaceholderRows && !hasSimulatedError ? ZERO_EPOCH_RECORDS : [],
    columns: epochColumns,
    getRowId: (row) => String(row.epoch),
  })

  // Columns for Dataset Curation Split Matrix DataGrid
  const curationColumns = React.useMemo<
    ColumnDef<DataGridFeatures, DatasetGroupRecord>[]
  >(
    () => [
      {
        accessorKey: "group",
        header: ({ column }) => (
          <DataGridColumnHeader title="Dataset Group" column={column} />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <FolderGit2Icon
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="font-mono text-xs font-medium">
              {row.original.group}
            </span>
          </div>
        ),
        meta: {
          headerTitle: "Dataset Group",
          skeleton: <Skeleton className="h-4 w-36" />,
        },
        size: 230,
      },
      {
        accessorKey: "split",
        header: ({ column }) => (
          <DataGridColumnHeader title="Target Split" column={column} />
        ),
        cell: ({ row }) => (
          <Badge variant="outline">{row.original.split.toUpperCase()}</Badge>
        ),
        meta: {
          headerTitle: "Target Split",
          skeleton: <Skeleton className="h-5 w-14" />,
        },
        size: 110,
      },
      {
        accessorKey: "scannedFrames",
        header: ({ column }) => (
          <DataGridColumnHeader title="Scanned Frames" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.scannedFrames}
          </span>
        ),
        meta: {
          headerTitle: "Scanned Frames",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
          skeleton: <Skeleton className="h-4 w-12" />,
        },
        size: 130,
      },
      {
        accessorKey: "validBoxes",
        header: ({ column }) => (
          <DataGridColumnHeader title="YOLO Boxes" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.validBoxes}
          </span>
        ),
        meta: {
          headerTitle: "YOLO Boxes",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
          skeleton: <Skeleton className="h-4 w-12" />,
        },
        size: 120,
      },
      {
        accessorKey: "blake2bDupes",
        header: ({ column }) => (
          <DataGridColumnHeader title="BLAKE2b Dupes" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.blake2bDupes}
          </span>
        ),
        meta: {
          headerTitle: "BLAKE2b Dupes",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
          skeleton: <Skeleton className="h-4 w-12" />,
        },
        size: 130,
      },
      {
        accessorKey: "burstClusters",
        header: ({ column }) => (
          <DataGridColumnHeader title="Burst Sequences" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.burstClusters}
          </span>
        ),
        meta: {
          headerTitle: "Burst Sequences",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
          skeleton: <Skeleton className="h-4 w-12" />,
        },
        size: 135,
      },
      {
        accessorKey: "leakageCount",
        header: ({ column }) => (
          <DataGridColumnHeader title="Leakage" column={column} />
        ),
        cell: ({ row }) => (
          <Badge variant="success-light">
            {row.original.leakageCount} Leaks
          </Badge>
        ),
        meta: {
          headerTitle: "Leakage",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
          skeleton: <Skeleton className="h-5 w-16" />,
        },
        size: 115,
      },
      {
        accessorKey: "medianAreaPct",
        header: ({ column }) => (
          <DataGridColumnHeader title="Median Area" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.medianAreaPct.toFixed(2)}%
          </span>
        ),
        meta: {
          headerTitle: "Median Area",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
          skeleton: <Skeleton className="h-4 w-14" />,
        },
        size: 120,
      },
    ],
    []
  )

  const curationTable = useTable({
    features: dataGridFeatures,
    data:
      showZeroPlaceholderRows && !hasSimulatedError
        ? ZERO_DATASET_GROUP_RECORDS
        : [],
    columns: curationColumns,
    getRowId: (row) => row.group,
  })

  // Columns for Model Checkpoints Registry DataGrid
  const registryColumns = React.useMemo<
    ColumnDef<DataGridFeatures, ModelCheckpointRecord>[]
  >(
    () => [
      {
        accessorKey: "checkpointName",
        header: ({ column }) => (
          <DataGridColumnHeader title="Artifact Path" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs font-medium">
            {row.original.checkpointName}
          </span>
        ),
        meta: {
          headerTitle: "Artifact Path",
          skeleton: <Skeleton className="h-4 w-48" />,
        },
        size: 270,
      },
      {
        accessorKey: "architecture",
        header: ({ column }) => (
          <DataGridColumnHeader title="Backbone" column={column} />
        ),
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.architecture}
          </span>
        ),
        meta: {
          headerTitle: "Backbone",
          skeleton: <Skeleton className="h-4 w-28" />,
        },
        size: 165,
      },
      {
        accessorKey: "format",
        header: ({ column }) => (
          <DataGridColumnHeader title="Runtime Format" column={column} />
        ),
        cell: ({ row }) => (
          <Badge variant="outline">{row.original.format}</Badge>
        ),
        meta: {
          headerTitle: "Runtime Format",
          skeleton: <Skeleton className="h-5 w-24" />,
        },
        size: 140,
      },
      {
        accessorKey: "map50",
        header: ({ column }) => (
          <DataGridColumnHeader title="mAP@50" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.map50.toFixed(4)}
          </span>
        ),
        meta: {
          headerTitle: "mAP@50",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
          skeleton: <Skeleton className="h-4 w-14" />,
        },
        size: 110,
      },
      {
        accessorKey: "latencyMs",
        header: ({ column }) => (
          <DataGridColumnHeader title="Latency" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.latencyMs.toFixed(1)} ms
          </span>
        ),
        meta: {
          headerTitle: "Latency",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
          skeleton: <Skeleton className="h-4 w-14" />,
        },
        size: 110,
      },
      {
        accessorKey: "fileSizeMb",
        header: ({ column }) => (
          <DataGridColumnHeader title="Size" column={column} />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums">
            {row.original.fileSizeMb.toFixed(1)} MB
          </span>
        ),
        meta: {
          headerTitle: "Size",
          headerClassName: "text-end [&>div]:justify-end",
          cellClassName: "text-end tabular-nums",
          skeleton: <Skeleton className="h-4 w-14" />,
        },
        size: 100,
      },
      {
        accessorKey: "status",
        header: ({ column }) => (
          <DataGridColumnHeader title="State" column={column} />
        ),
        cell: ({ row }) => (
          <Badge variant="info-light">{row.original.status}</Badge>
        ),
        meta: {
          headerTitle: "State",
          skeleton: <Skeleton className="h-5 w-24" />,
        },
        size: 140,
      },
    ],
    []
  )

  const registryTable = useTable({
    features: dataGridFeatures,
    data:
      showZeroPlaceholderRows && !hasSimulatedError
        ? ZERO_MODEL_CHECKPOINTS
        : [],
    columns: registryColumns,
    getRowId: (row) => row.id,
  })

  const activeNavMeta =
    NAV_SECTIONS.find((item) => item.id === activeSection) ?? NAV_SECTIONS[0]

  return (
    <SidebarProvider defaultOpen>
      {/* Left Collapsible Operational Sidebar Shell */}
      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <SidebarMenuButton size="lg" tooltip="Switch Model Workspace">
                      <IconTile variant="solid" size="sm">
                        <RadarIcon />
                      </IconTile>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-none">
                        <span className="truncate font-semibold tracking-tight">
                          SIRI-DL Console
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {selectedWorkspace.name}
                        </span>
                      </div>
                      <SlidersHorizontalIcon className="ml-auto size-4 text-muted-foreground" />
                    </SidebarMenuButton>
                  }
                />
                <DropdownMenuContent className="w-64" align="start" side="bottom">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>
                      Model Runtime Environments
                    </DropdownMenuLabel>
                    {WORKSPACE_PROFILES.map((ws) => (
                      <DropdownMenuItem
                        key={ws.id}
                        onClick={() => {
                          setSelectedWorkspace(ws)
                          toast.info(`Switched context to ${ws.name} (0 values)`)
                        }}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-medium">{ws.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {ws.checkpoint}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Operations & Analysis</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_SECTIONS.map((item) => {
                  const Icon = item.icon
                  const isCurrent = activeSection === item.id
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={isCurrent}
                        aria-current={isCurrent ? "page" : undefined}
                        tooltip={item.label}
                        onClick={() => setActiveSection(item.id)}
                      >
                        <Icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          <SidebarGroup>
            <SidebarGroupLabel>Python Pipeline Modules</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    size="sm"
                    tooltip="prepare_dataset.py (0 images)"
                    onClick={() => setActiveSection("curation")}
                  >
                    <FileCode2Icon />
                    <span className="font-mono text-xs">prepare_dataset.py</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>0</SidebarMenuBadge>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    size="sm"
                    tooltip="pseudo_label.py (0 mined)"
                    onClick={() => setActiveSection("curation")}
                  >
                    <SparklesIcon />
                    <span className="font-mono text-xs">pseudo_label.py</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>0</SidebarMenuBadge>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    size="sm"
                    tooltip="train.py (Epoch 0/0)"
                    onClick={() => setActiveSection("training")}
                  >
                    <CpuIcon />
                    <span className="font-mono text-xs">train.py</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>0</SidebarMenuBadge>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    size="sm"
                    tooltip="predict.py (0 detections)"
                    onClick={() => setActiveSection("inference")}
                  >
                    <VideoIcon />
                    <span className="font-mono text-xs">predict.py</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>0</SidebarMenuBadge>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>GPU & PostGIS Telemetry</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="flex flex-col gap-2 px-2 py-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">CUDA:0 VRAM</span>
                  <span className="font-mono tabular-nums">0.0 / 0.0 GB</span>
                </div>
                <Progress value={0} aria-label="GPU VRAM usage 0 percent" />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">PostGIS Spatial</span>
                  <span className="font-mono tabular-nums">0 / 0 rows</span>
                </div>
                <Progress value={0} aria-label="PostGIS rows 0 percent" />
                <div className="flex items-center justify-between pt-1 text-xs">
                  <span className="text-muted-foreground">Stream FPS</span>
                  <Badge variant="outline">0.0 FPS</Badge>
                </div>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                tooltip="António Bastos · PAP 2025/2026"
                onClick={() => setCommandOpen(true)}
              >
                <Avatar className="size-7">
                  <AvatarFallback className="text-xs font-semibold">
                    AB
                  </AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-none">
                  <span className="truncate text-xs font-medium">
                    António Bastos
                  </span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    SIRI-DL · Zero-State
                  </span>
                </div>
                <Badge variant="outline">0</Badge>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      {/* Main Operational Inset Surface */}
      <SidebarInset className="min-w-0">
        {/* Top Application Header Bar */}
        <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center justify-between gap-2 border-b bg-background/95 px-4 backdrop-blur-xs">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger />
            <Separator orientation="vertical" className="my-auto h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:inline-flex">
                  <BreadcrumbLink
                    href="#overview"
                    onClick={(e) => {
                      e.preventDefault()
                      setActiveSection("overview")
                    }}
                  >
                    SIRI-DL
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:inline-flex" />
                <BreadcrumbItem>
                  <BreadcrumbPage className="truncate font-medium">
                    {activeNavMeta.label}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <Badge variant="info-light" className="hidden sm:inline-flex">
              All Values = 0
            </Badge>
          </div>

          {/* Right Header Operational Controls */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCommandOpen(true)}
            >
              <SearchIcon />
              <span className="hidden sm:inline">Command</span>
              <kbd className="hidden rounded-sm border bg-muted px-1 font-mono text-xs text-muted-foreground sm:inline-block">
                ⌘K
              </kbd>
            </Button>

            <div className="hidden items-center gap-1.5 rounded-lg border px-2 py-1 lg:flex">
              <Label
                htmlFor="zero-rows-switch"
                className="cursor-pointer text-xs text-muted-foreground"
              >
                0-Rows
              </Label>
              <Switch
                id="zero-rows-switch"
                checked={showZeroPlaceholderRows}
                onCheckedChange={(checked) => {
                  setShowZeroPlaceholderRows(!!checked)
                  toast.info(
                    checked
                      ? "Showing zero-initialized telemetry rows (all values = 0)"
                      : "Showing pure Empty states (0 rows)"
                  )
                }}
              />
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={triggerLoadingPreview}
              aria-label="Synchronize zero telemetry"
            >
              <RefreshCwIcon />
              <span className="hidden md:inline">Sync (0)</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={handleToggleTheme}
              aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </Button>

            {/* Destructive Reset Confirmation via AlertDialog */}
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button type="button" variant="outline" size="sm">
                    <RotateCcwIcon />
                    <span className="hidden sm:inline">Reset 0</span>
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset All Telemetry to Zero</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action resets every model threshold, hyperparameter,
                    filter condition, and dispatch counter back to its strict
                    0.00 baseline.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleResetAllZero}>
                    Confirm Zero Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Primary Action: Launch Pipeline Wizard Dialog */}
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setWizardStep(1)
                setWizardOpen(true)
              }}
            >
              <PlayIcon />
              <span>Run Pipeline</span>
            </Button>
          </div>
        </header>

        {/* Main Content Container */}
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
          {/* Page Title & Quick View Switcher */}
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight">
                  {activeNavMeta.label}
                </h1>
                <Badge variant="outline">YOLOv11s · 1280px</Badge>
                <Badge variant="success-light">0 Data Leaks</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {activeNavMeta.description}
              </p>
            </div>

            {/* Horizontal Section Switcher Tabs */}
            <Tabs
              value={activeSection}
              onValueChange={(val) =>
                setActiveSection(val as DashboardSectionId)
              }
            >
              <TabsList className="flex-wrap">
                {NAV_SECTIONS.map((sec) => (
                  <TabsTrigger key={sec.id} value={sec.id}>
                    {sec.shortLabel}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {/* Global Zero-Baseline Operational Notice */}
          <Alert variant="info" role="status">
            <TerminalIcon />
            <AlertTitle>
              Zero-Initialized Telemetry Shell Active (All Metrics = 0)
            </AlertTitle>
            <AlertDescription>
              Connected to workspace{" "}
              <span className="font-mono font-medium">
                {selectedWorkspace.checkpoint}
              </span>
              . All KPI counters, loss curves, confusion cells, BLAKE2b hash
              buckets, and PostGIS spatial coordinates are initialized to 0.
            </AlertDescription>
            <AlertAction>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() =>
                  setHasSimulatedError((prev) => {
                    const next = !prev
                    toast.info(
                      next
                        ? "Simulated inline region error state enabled"
                        : "Inline error state cleared"
                    )
                    return next
                  })
                }
              >
                {hasSimulatedError ? "Clear Error State" : "Test Error State"}
              </Button>
            </AlertAction>
          </Alert>

          {/* ============================================================== */}
          {/* VIEW 1: EXECUTIVE TELEMETRY OVERVIEW                           */}
          {/* ============================================================== */}
          {activeSection === "overview" && (
            <div className="flex flex-col gap-6">
              {/* 4-Column KPI Row using Frame & FramePanel */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {ZERO_OVERVIEW_KPIS.map((kpi) => (
                  <Frame key={kpi.id} spacing="default">
                    <FramePanel>
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-muted-foreground">
                            {kpi.title}
                          </span>
                          <Badge variant={kpi.badgeVariant}>{kpi.badge}</Badge>
                        </div>
                        {isSimulatingLoad ? (
                          <Skeleton className="h-8 w-28" />
                        ) : (
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-semibold tracking-tight tabular-nums">
                              {kpi.value}
                            </span>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {kpi.unit}
                            </span>
                            <Badge variant="outline">{kpi.delta}</Badge>
                          </div>
                        )}
                        <div className="flex flex-col gap-1 border-t pt-2">
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {kpi.meta}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground/80">
                            {kpi.pipelineRef}
                          </span>
                        </div>
                      </div>
                    </FramePanel>
                  </Frame>
                ))}
              </div>

              {/* Dual Analytical Panels: Zero-Baseline Telemetry & Pipeline Architecture Timeline */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Left 7 Cols: Zero-State Multi-Metric Analytical Canvas */}
                <div className="lg:col-span-7">
                  <Frame spacing="default">
                    <FrameHeader>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <FrameTitle>
                              Real-Time Anomaly & Loss Telemetry
                            </FrameTitle>
                            <Badge variant="outline">0.00 Baseline</Badge>
                          </div>
                          <FrameDescription>
                            Box loss, Cls loss, DFL loss and mAP@50 across 0
                            evaluated epochs
                          </FrameDescription>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="info-light">Box: 0.000</Badge>
                          <Badge variant="success-light">mAP@50: 0.000</Badge>
                        </div>
                      </div>
                    </FrameHeader>
                    <FramePanel>
                      {isSimulatingLoad ? (
                        <div className="flex flex-col gap-3">
                          <Skeleton className="h-48 w-full" />
                          <Skeleton className="h-6 w-full" />
                        </div>
                      ) : hasSimulatedError ? (
                        <Alert variant="destructive">
                          <AlertTriangleIcon />
                          <AlertTitle>
                            Telemetry Stream Disconnected (Code 0)
                          </AlertTitle>
                          <AlertDescription>
                            Unable to read training metrics from{" "}
                            <span className="font-mono">
                              runs/pothole/baseline/results.csv
                            </span>
                            .
                          </AlertDescription>
                          <AlertAction>
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              onClick={() => setHasSimulatedError(false)}
                            >
                              Retry Stream
                            </Button>
                          </AlertAction>
                        </Alert>
                      ) : (
                        <div className="flex flex-col gap-4">
                          {/* SVG Zero-State Coordinate System Chart */}
                          <div className="relative flex h-52 w-full flex-col justify-between rounded-lg border bg-muted/20 p-4">
                            <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                              <span>1.00</span>
                              <span className="font-mono text-xs">
                                Y-Axis: Normalized Metric / Loss (All = 0.000)
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground/60 tabular-nums">
                              <span>0.75</span>
                              <div className="h-px flex-1 border-b border-dashed border-border mx-3" />
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground/60 tabular-nums">
                              <span>0.50</span>
                              <div className="h-px flex-1 border-b border-dashed border-border mx-3" />
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground/60 tabular-nums">
                              <span>0.25</span>
                              <div className="h-px flex-1 border-b border-dashed border-border mx-3" />
                            </div>
                            {/* Active Zero Flatline */}
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-xs font-semibold text-foreground tabular-nums">
                                0.00
                              </span>
                              <div className="relative h-0.5 flex-1 bg-primary">
                                <div className="absolute -top-1.5 left-0 size-3 rounded-full border-2 border-background bg-primary" />
                                <div className="absolute -top-1.5 left-1/4 size-3 rounded-full border-2 border-background bg-primary" />
                                <div className="absolute -top-1.5 left-2/4 size-3 rounded-full border-2 border-background bg-primary" />
                                <div className="absolute -top-1.5 left-3/4 size-3 rounded-full border-2 border-background bg-primary" />
                                <div className="absolute -top-1.5 right-0 size-3 rounded-full border-2 border-background bg-primary" />
                              </div>
                            </div>
                            <div className="flex items-center justify-between pt-1 font-mono text-xs text-muted-foreground tabular-nums">
                              <span>Epoch 0</span>
                              <span>Epoch 0</span>
                              <span>Epoch 0</span>
                              <span>Epoch 0</span>
                              <span>Epoch 0</span>
                            </div>
                          </div>

                          {/* Sub-metrics breakdown bar */}
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div className="flex flex-col gap-0.5 rounded-lg border p-2.5">
                              <span className="text-xs text-muted-foreground">
                                Preprocess Speed
                              </span>
                              <span className="font-mono text-sm font-semibold tabular-nums">
                                0.0 ms
                              </span>
                            </div>
                            <div className="flex flex-col gap-0.5 rounded-lg border p-2.5">
                              <span className="text-xs text-muted-foreground">
                                Inference Speed
                              </span>
                              <span className="font-mono text-sm font-semibold tabular-nums">
                                0.0 ms
                              </span>
                            </div>
                            <div className="flex flex-col gap-0.5 rounded-lg border p-2.5">
                              <span className="text-xs text-muted-foreground">
                                Postprocess NMS
                              </span>
                              <span className="font-mono text-sm font-semibold tabular-nums">
                                0.0 ms
                              </span>
                            </div>
                            <div className="flex flex-col gap-0.5 rounded-lg border p-2.5">
                              <span className="text-xs text-muted-foreground">
                                Mean Area Affected
                              </span>
                              <span className="font-mono text-sm font-semibold tabular-nums">
                                0.000%
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </FramePanel>
                    <FrameFooter>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          Pipeline: Ultralytics YOLOv11 · Scale Jitter: 0.0 ·
                          MixUp: 0.0
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => setActiveSection("training")}
                        >
                          Open Training Diagnostics
                          <ArrowUpRightIcon />
                        </Button>
                      </div>
                    </FrameFooter>
                  </Frame>
                </div>

                {/* Right 5 Cols: End-to-End Pipeline Execution Timeline (`@reui/timeline`) */}
                <div className="lg:col-span-5">
                  <Frame spacing="default">
                    <FrameHeader>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-col gap-0.5">
                          <FrameTitle>SIRI-DL Pipeline Architecture</FrameTitle>
                          <FrameDescription>
                            5-stage Data-Centric AI & PostGIS lifecycle
                          </FrameDescription>
                        </div>
                        <Badge variant="outline">Stage 0 / 5</Badge>
                      </div>
                    </FrameHeader>
                    <FramePanel>
                      <Timeline defaultValue={0}>
                        <TimelineItem step={1}>
                          <TimelineHeader>
                            <TimelineDate>
                              Stage 1 · prepare_dataset.py
                            </TimelineDate>
                            <TimelineTitle>
                              Cryptographic Deduplication & Burst Clustering
                            </TimelineTitle>
                          </TimelineHeader>
                          <TimelineIndicator />
                          <TimelineSeparator />
                          <TimelineContent>
                            BLAKE2b hashing (0 dupes removed) + camera burst
                            sequence grouping (0 leaks across splits).
                          </TimelineContent>
                        </TimelineItem>

                        <TimelineItem step={2}>
                          <TimelineHeader>
                            <TimelineDate>
                              Stage 2 · pseudo_label.py
                            </TimelineDate>
                            <TimelineTitle>
                              High-Throughput Semi-Supervised Mining
                            </TimelineTitle>
                          </TimelineHeader>
                          <TimelineIndicator />
                          <TimelineSeparator />
                          <TimelineContent>
                            Batched GPU inference on unannotated road frames (0
                            accepted · 0 rejected at 0.00 conf).
                          </TimelineContent>
                        </TimelineItem>

                        <TimelineItem step={3}>
                          <TimelineHeader>
                            <TimelineDate>Stage 3 · train.py</TimelineDate>
                            <TimelineTitle>
                              YOLOv11 High-Resolution Training (1280px)
                            </TimelineTitle>
                          </TimelineHeader>
                          <TimelineIndicator />
                          <TimelineSeparator />
                          <TimelineContent>
                            Cosine LR schedule, mosaic close in final 0 epochs,
                            evaluated on holdout test split (mAP@50 = 0.000).
                          </TimelineContent>
                        </TimelineItem>

                        <TimelineItem step={4}>
                          <TimelineHeader>
                            <TimelineDate>Stage 4 · predict.py</TimelineDate>
                            <TimelineTitle>
                              Real-Time Dashcam Inference & Severity Area
                            </TimelineTitle>
                          </TimelineHeader>
                          <TimelineIndicator />
                          <TimelineSeparator />
                          <TimelineContent>
                            Extracts bounding boxes, computes surface area
                            percentage (0.000%), exports JSON/CSV telemetry.
                          </TimelineContent>
                        </TimelineItem>

                        <TimelineItem step={5}>
                          <TimelineHeader>
                            <TimelineDate>
                              Stage 5 · FastAPI + PostGIS
                            </TimelineDate>
                            <TimelineTitle>
                              Geospatial Indexing & Municipal Dispatch
                            </TimelineTitle>
                          </TimelineHeader>
                          <TimelineIndicator />
                          <TimelineSeparator />
                          <TimelineContent>
                            Spatial point indexing (SRID 4326) and automated
                            public works crew scheduling (0 active tickets).
                          </TimelineContent>
                        </TimelineItem>
                      </Timeline>
                    </FramePanel>
                  </Frame>
                </div>
              </div>

              {/* Bottom Full-Width Table: Recent Anomaly Telemetry Log */}
              <DataGrid
                table={detectionTable}
                recordCount={filteredDetections.length}
                isLoading={isSimulatingLoad}
                onRowClick={(row) => setInspectedDetection(row)}
                tableLayout={{
                  headerSticky: true,
                  columnsResizable: true,
                  columnsPinnable: true,
                  columnsVisibility: true,
                  dense: true,
                }}
                tableClassNames={{ base: "min-w-[860px]" }}
                emptyMessage={
                  <Empty className="border-none py-8">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <RadarIcon />
                      </EmptyMedia>
                      <EmptyTitle>
                        0 Road Anomalies Recorded in Telemetry
                      </EmptyTitle>
                      <EmptyDescription>
                        All detection counters are set to 0. Enable
                        &ldquo;0-Rows&rdquo; in the top bar to inspect
                        zero-initialized placeholder slots or launch an
                        inference run.
                      </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => setShowZeroPlaceholderRows(true)}
                        >
                          Show Zero-Initialized Rows
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setWizardOpen(true)}
                        >
                          Configure predict.py
                        </Button>
                      </div>
                    </EmptyContent>
                  </Empty>
                }
              >
                <Frame spacing="default">
                  <FrameHeader>
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <FrameTitle>
                            Anomaly Detection Telemetry Ledger
                          </FrameTitle>
                          <Badge variant="outline">
                            {filteredDetections.length} Zero-State Records
                          </Badge>
                        </div>
                        <FrameDescription>
                          Click any row to open the bounding-box & EXIF GPS
                          telemetry inspector sheet
                        </FrameDescription>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          placeholder="Search frame or corridor..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-48"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveSection("inference")}
                        >
                          <SlidersHorizontalIcon />
                          Inference Workbench
                        </Button>
                      </div>
                    </div>
                  </FrameHeader>
                  <FramePanel className="p-0">
                    <DataGridScrollArea>
                      <DataGridTable
                        footerContent={
                          <DataGridTableFootRow>
                            <DataGridTableFootRowCell
                              colSpan={detectionColumns.length}
                            >
                              <div className="flex items-center justify-between text-xs text-muted-foreground tabular-nums">
                                <span>
                                  Aggregated Severity: 0 Critical · 0 High · 0
                                  Medium · 0 Low
                                </span>
                                <span className="font-mono">
                                  Mean Confidence: 0.0000 · Mean Area: 0.000% ·
                                  Total Detections: 0
                                </span>
                              </div>
                            </DataGridTableFootRowCell>
                          </DataGridTableFootRow>
                        }
                      />
                    </DataGridScrollArea>
                  </FramePanel>
                  <FrameFooter>
                    <DataGridPagination />
                  </FrameFooter>
                </Frame>
              </DataGrid>
            </div>
          )}

          {/* ============================================================== */}
          {/* VIEW 2: INFERENCE & DETECTIONS WORKBENCH                       */}
          {/* ============================================================== */}
          {activeSection === "inference" && (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Left 4 Cols: Inference Parameter Controls (`predict.py`) */}
                <div className="lg:col-span-4">
                  <Frame spacing="default">
                    <FrameHeader>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-col gap-0.5">
                          <FrameTitle>Detector Parameters</FrameTitle>
                          <FrameDescription>
                            Mirrors CLI flags in{" "}
                            <span className="font-mono">predict.py</span>
                          </FrameDescription>
                        </div>
                        <Badge variant="outline">All = 0</Badge>
                      </div>
                    </FrameHeader>
                    <FramePanel>
                      <div className="flex flex-col gap-4">
                        <NumberField
                          size="sm"
                          value={confThreshold}
                          onValueChange={(v) => setConfThreshold(v ?? 0)}
                          min={0}
                          max={1}
                          step={0.05}
                        >
                          <NumberFieldScrubArea label="Confidence Threshold (--conf)" />
                          <NumberFieldGroup>
                            <NumberFieldDecrement />
                            <NumberFieldInput />
                            <NumberFieldIncrement />
                          </NumberFieldGroup>
                        </NumberField>

                        <NumberField
                          size="sm"
                          value={iouThreshold}
                          onValueChange={(v) => setIouThreshold(v ?? 0)}
                          min={0}
                          max={1}
                          step={0.05}
                        >
                          <NumberFieldScrubArea label="NMS IoU Threshold (--iou)" />
                          <NumberFieldGroup>
                            <NumberFieldDecrement />
                            <NumberFieldInput />
                            <NumberFieldIncrement />
                          </NumberFieldGroup>
                        </NumberField>

                        <NumberField
                          size="sm"
                          value={imgResolution}
                          onValueChange={(v) => setImgResolution(v ?? 0)}
                          min={0}
                          max={2560}
                          step={64}
                        >
                          <NumberFieldScrubArea label="Inference Image Size (--imgsz px)" />
                          <NumberFieldGroup>
                            <NumberFieldDecrement />
                            <NumberFieldInput />
                            <NumberFieldIncrement />
                          </NumberFieldGroup>
                        </NumberField>

                        <NumberField
                          size="sm"
                          value={maxDetections}
                          onValueChange={(v) => setMaxDetections(v ?? 0)}
                          min={0}
                          max={1000}
                          step={10}
                        >
                          <NumberFieldScrubArea label="Max Detections per Frame (--max-det)" />
                          <NumberFieldGroup>
                            <NumberFieldDecrement />
                            <NumberFieldInput />
                            <NumberFieldIncrement />
                          </NumberFieldGroup>
                        </NumberField>

                        <Separator />

                        <div className="flex items-center justify-between">
                          <div className="flex flex-col gap-0.5">
                            <Label htmlFor="tta-switch" className="text-xs">
                              Test-Time Augmentation (--tta)
                            </Label>
                            <span className="text-xs text-muted-foreground">
                              Multi-scale flip ensemble
                            </span>
                          </div>
                          <Switch
                            id="tta-switch"
                            checked={ttaEnabled}
                            onCheckedChange={(c) => setTtaEnabled(!!c)}
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <div className="flex flex-col gap-0.5">
                            <Label htmlFor="fp16-switch" className="text-xs">
                              FP16 Half Precision
                            </Label>
                            <span className="text-xs text-muted-foreground">
                              TensorCore acceleration
                            </span>
                          </div>
                          <Switch
                            id="fp16-switch"
                            checked={fp16Enabled}
                            onCheckedChange={(c) => setFp16Enabled(!!c)}
                          />
                        </div>

                        <Separator />

                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="flex-1"
                            onClick={() =>
                              toast.info(
                                "Dry-run inference executed: 0 frames processed, 0 potholes found."
                              )
                            }
                          >
                            <PlayIcon />
                            Execute Dry-Run (0)
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleResetAllZero}
                          >
                            Zero
                          </Button>
                        </div>
                      </div>
                    </FramePanel>
                  </Frame>
                </div>

                {/* Right 8 Cols: Dashcam Frame Viewport & Speed Telemetry */}
                <div className="lg:col-span-8">
                  <Frame spacing="default">
                    <FrameHeader>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-2">
                            <FrameTitle>
                              Dashcam Telemetry Viewport (1280 × 720)
                            </FrameTitle>
                            <Badge variant="info-light">0 Boxes</Badge>
                          </div>
                          <FrameDescription>
                            Source:{" "}
                            <span className="font-mono">
                              assets/reference.jpg
                            </span>{" "}
                            · 0 detections above threshold ({confThreshold.toFixed(2)})
                          </FrameDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">Pre: 0.0ms</Badge>
                          <Badge variant="outline">Inf: 0.0ms</Badge>
                          <Badge variant="outline">Post: 0.0ms</Badge>
                        </div>
                      </div>
                    </FrameHeader>
                    <FramePanel>
                      <div className="relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden rounded-lg border bg-muted/30 p-6">
                        {/* Subtle reticle grid */}
                        <div
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 grid grid-cols-4 grid-rows-3"
                        >
                          {Array.from({ length: 12 }).map((_, idx) => (
                            <div
                              key={idx}
                              className="border-r border-b border-dashed border-border/50"
                            />
                          ))}
                        </div>

                        {/* Top-left HUD Telemetry Overlay */}
                        <div className="absolute top-3 left-3 flex flex-col gap-1 rounded-md border bg-background/90 px-2.5 py-1.5 font-mono text-xs tabular-nums">
                          <span>STREAM: VTR-00 DASHCAM #0</span>
                          <span>RES: 0 × 0 px · FPS: 0.0</span>
                          <span>GPS: 0.000000° N, 0.000000° W</span>
                        </div>

                        {/* Top-right HUD Bounding Box Counter */}
                        <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-md border bg-background/90 px-2.5 py-1.5 font-mono text-xs tabular-nums">
                          <span className="size-2 rounded-full bg-muted-foreground" />
                          <span>POTHOLES: 0 · AREA: 0.000%</span>
                        </div>

                        {/* Center Empty Viewport Notice */}
                        <div className="relative z-10 flex max-w-sm flex-col items-center gap-2 text-center">
                          <IconTile variant="frame" size="lg">
                            <CameraIcon />
                          </IconTile>
                          <span className="text-sm font-semibold">
                            Zero Active Stream Frame (0 Detections)
                          </span>
                          <p className="text-xs text-muted-foreground">
                            Connect a dashcam RTSP stream, upload a road video,
                            or run{" "}
                            <span className="font-mono">
                              predict.py --conf 0.00
                            </span>{" "}
                            to populate bounding-box overlays.
                          </p>
                        </div>
                      </div>
                    </FramePanel>
                    <FrameFooter>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">
                          Output: predictions/results/detections.json (0 B) ·
                          detections.csv (0 B)
                        </span>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() =>
                              toast.info("Exported 0 rows to detections.csv")
                            }
                          >
                            <DownloadIcon />
                            Export CSV (0)
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() =>
                              toast.info("Exported 0 records to detections.json")
                            }
                          >
                            <DownloadIcon />
                            Export JSON (0)
                          </Button>
                        </div>
                      </div>
                    </FrameFooter>
                  </Frame>
                </div>
              </div>

              {/* Filter Builder + Full Detections DataGrid */}
              <DataGrid
                table={detectionTable}
                recordCount={filteredDetections.length}
                isLoading={isSimulatingLoad}
                onRowClick={(row) => setInspectedDetection(row)}
                tableLayout={{
                  headerSticky: true,
                  columnsResizable: true,
                  columnsPinnable: true,
                  columnsVisibility: true,
                  dense: true,
                }}
                tableClassNames={{ base: "min-w-[860px]" }}
              >
                <Frame spacing="default">
                  <FrameHeader>
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div className="flex flex-col gap-0.5">
                        <FrameTitle>
                          Multi-Condition Anomaly Filter & DataGrid
                        </FrameTitle>
                        <FrameDescription>
                          Filter detections by corridor, confidence score, surface
                          area percentage, or dispatch state
                        </FrameDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <DataGridColumnVisibility
                          table={detectionTable}
                          trigger={
                            <Button type="button" variant="outline" size="sm">
                              <Settings2Icon />
                              Columns
                            </Button>
                          }
                        />
                      </div>
                    </div>
                  </FrameHeader>
                  <FramePanel>
                    <div className="flex flex-col gap-3">
                      <Filters
                        fields={DETECTION_FILTER_FIELDS}
                        query={filterQuery}
                        onQueryChange={setFilterQuery}
                        size="sm"
                        showClear
                      />
                    </div>
                  </FramePanel>
                  <FramePanel className="p-0">
                    <DataGridScrollArea>
                      <DataGridTable />
                    </DataGridScrollArea>
                  </FramePanel>
                  <FrameFooter>
                    <DataGridPagination />
                  </FrameFooter>
                </Frame>
              </DataGrid>
            </div>
          )}

          {/* ============================================================== */}
          {/* VIEW 3: MODEL TRAINING & EVALUATION                            */}
          {/* ============================================================== */}
          {activeSection === "training" && (
            <div className="flex flex-col gap-6">
              {/* 4 Training KPIs */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {ZERO_TRAINING_KPIS.map((item) => (
                  <Frame key={item.id} spacing="default">
                    <FramePanel>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">
                            {item.title}
                          </span>
                          <Badge variant="outline">{item.badge}</Badge>
                        </div>
                        <span className="text-2xl font-semibold tracking-tight tabular-nums">
                          {item.value}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.sub}
                        </span>
                      </div>
                    </FramePanel>
                  </Frame>
                ))}
              </div>

              {/* Confusion Matrix + Hyperparameters */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Left 6 Cols: 2x2 Pothole vs Background Confusion Matrix */}
                <div className="lg:col-span-6">
                  <Frame spacing="default">
                    <FrameHeader>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-col gap-0.5">
                          <FrameTitle>
                            Validation Confusion Matrix (IoU=0.50)
                          </FrameTitle>
                          <FrameDescription>
                            Class 0 (pothole) vs Background false positives &
                            false negatives
                          </FrameDescription>
                        </div>
                        <Badge variant="info-light">F1 = 0.000</Badge>
                      </div>
                    </FrameHeader>
                    <FramePanel>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col justify-between gap-2 rounded-lg border bg-muted/20 p-4">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">
                              True Positive (TP)
                            </span>
                            <Badge variant="success-light">0.0%</Badge>
                          </div>
                          <span className="text-2xl font-semibold tracking-tight tabular-nums">
                            0
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            Pred: pothole · True: pothole
                          </span>
                        </div>

                        <div className="flex flex-col justify-between gap-2 rounded-lg border bg-muted/20 p-4">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">
                              False Positive (FP)
                            </span>
                            <Badge variant="warning-light">0.0%</Badge>
                          </div>
                          <span className="text-2xl font-semibold tracking-tight tabular-nums">
                            0
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            Pred: pothole · True: background
                          </span>
                        </div>

                        <div className="flex flex-col justify-between gap-2 rounded-lg border bg-muted/20 p-4">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">
                              False Negative (FN)
                            </span>
                            <Badge variant="destructive-light">0.0%</Badge>
                          </div>
                          <span className="text-2xl font-semibold tracking-tight tabular-nums">
                            0
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            Pred: background · True: pothole
                          </span>
                        </div>

                        <div className="flex flex-col justify-between gap-2 rounded-lg border bg-muted/20 p-4">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">
                              True Negative (BG)
                            </span>
                            <Badge variant="outline">0.0%</Badge>
                          </div>
                          <span className="text-2xl font-semibold tracking-tight tabular-nums">
                            0
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            Negative road frames verified
                          </span>
                        </div>
                      </div>
                    </FramePanel>
                    <FrameFooter>
                      <span className="font-mono text-xs text-muted-foreground">
                        Evaluation split: test · Total ground-truth instances: 0
                      </span>
                    </FrameFooter>
                  </Frame>
                </div>

                {/* Right 6 Cols: Road-Specific Augmentation & Hyperparameter Controls */}
                <div className="lg:col-span-6">
                  <Frame spacing="default">
                    <FrameHeader>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-col gap-0.5">
                          <FrameTitle>
                            Hyperparameters & Road Augmentations
                          </FrameTitle>
                          <FrameDescription>
                            Configured for RTX 40-series scale variance (
                            <span className="font-mono">train.py</span>)
                          </FrameDescription>
                        </div>
                        <Badge variant="outline">Seed: 0</Badge>
                      </div>
                    </FrameHeader>
                    <FramePanel>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <NumberField
                          size="sm"
                          value={epochsCount}
                          onValueChange={(v) => setEpochsCount(v ?? 0)}
                          min={0}
                          max={500}
                          step={10}
                        >
                          <NumberFieldScrubArea label="Epochs (--epochs)" />
                          <NumberFieldGroup>
                            <NumberFieldDecrement />
                            <NumberFieldInput />
                            <NumberFieldIncrement />
                          </NumberFieldGroup>
                        </NumberField>

                        <NumberField
                          size="sm"
                          value={batchSize}
                          onValueChange={(v) => setBatchSize(v ?? 0)}
                          min={0}
                          max={64}
                          step={2}
                        >
                          <NumberFieldScrubArea label="Batch Size (--batch)" />
                          <NumberFieldGroup>
                            <NumberFieldDecrement />
                            <NumberFieldInput />
                            <NumberFieldIncrement />
                          </NumberFieldGroup>
                        </NumberField>

                        <NumberField
                          size="sm"
                          value={patienceEpochs}
                          onValueChange={(v) => setPatienceEpochs(v ?? 0)}
                          min={0}
                          max={100}
                          step={5}
                        >
                          <NumberFieldScrubArea label="Early Stopping (--patience)" />
                          <NumberFieldGroup>
                            <NumberFieldDecrement />
                            <NumberFieldInput />
                            <NumberFieldIncrement />
                          </NumberFieldGroup>
                        </NumberField>

                        <NumberField
                          size="sm"
                          value={scaleJitter}
                          onValueChange={(v) => setScaleJitter(v ?? 0)}
                          min={0}
                          max={1}
                          step={0.1}
                        >
                          <NumberFieldScrubArea label="Scale Jitter (--scale)" />
                          <NumberFieldGroup>
                            <NumberFieldDecrement />
                            <NumberFieldInput />
                            <NumberFieldIncrement />
                          </NumberFieldGroup>
                        </NumberField>

                        <NumberField
                          size="sm"
                          value={mixupProb}
                          onValueChange={(v) => setMixupProb(v ?? 0)}
                          min={0}
                          max={1}
                          step={0.05}
                        >
                          <NumberFieldScrubArea label="Asphalt MixUp (--mixup)" />
                          <NumberFieldGroup>
                            <NumberFieldDecrement />
                            <NumberFieldInput />
                            <NumberFieldIncrement />
                          </NumberFieldGroup>
                        </NumberField>

                        <NumberField
                          size="sm"
                          value={mosaicProb}
                          onValueChange={(v) => setMosaicProb(v ?? 0)}
                          min={0}
                          max={1}
                          step={0.1}
                        >
                          <NumberFieldScrubArea label="Mosaic Prob (--mosaic)" />
                          <NumberFieldGroup>
                            <NumberFieldDecrement />
                            <NumberFieldInput />
                            <NumberFieldIncrement />
                          </NumberFieldGroup>
                        </NumberField>
                      </div>
                    </FramePanel>
                    <FrameFooter>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          Cosine LR: Enabled · Close Mosaic: Last 0 epochs
                        </span>
                        <Button
                          type="button"
                          size="xs"
                          onClick={() =>
                            toast.info(
                              "Training job queued with 0 epochs (dry-run mode)"
                            )
                          }
                        >
                          Queue Training Run
                        </Button>
                      </div>
                    </FrameFooter>
                  </Frame>
                </div>
              </div>

              {/* Epoch Telemetry Table */}
              <Frame spacing="default">
                <FrameHeader>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <FrameTitle>Per-Epoch Validation & Loss Ledger</FrameTitle>
                      <FrameDescription>
                        Live callback telemetry from{" "}
                        <span className="font-mono">train.py</span> monitor
                      </FrameDescription>
                    </div>
                    <Badge variant="outline">0 / 0 Epochs Completed</Badge>
                  </div>
                </FrameHeader>
                <FramePanel className="p-0">
                  <DataGrid
                    table={epochTable}
                    recordCount={
                      showZeroPlaceholderRows ? ZERO_EPOCH_RECORDS.length : 0
                    }
                    isLoading={isSimulatingLoad}
                    tableLayout={{
                      headerSticky: true,
                      columnsResizable: true,
                      dense: true,
                    }}
                    tableClassNames={{ base: "min-w-[820px]" }}
                  >
                    <DataGridScrollArea>
                      <DataGridTable />
                    </DataGridScrollArea>
                  </DataGrid>
                </FramePanel>
              </Frame>
            </div>
          )}

          {/* ============================================================== */}
          {/* VIEW 4: DATASET CURATION & PSEUDO-LABELING                     */}
          {/* ============================================================== */}
          {activeSection === "curation" && (
            <div className="flex flex-col gap-6">
              {/* 4 Curation KPIs */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {ZERO_CURATION_KPIS.map((item) => (
                  <Frame key={item.id} spacing="default">
                    <FramePanel>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">
                            {item.title}
                          </span>
                          <Badge variant="outline">{item.badge}</Badge>
                        </div>
                        <span className="text-2xl font-semibold tracking-tight tabular-nums">
                          {item.value}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {item.sub}
                        </span>
                      </div>
                    </FramePanel>
                  </Frame>
                ))}
              </div>

              {/* Interactive 4-Step Dataset Curation & Pseudo-Label Stepper */}
              <Frame spacing="default">
                <FrameHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <FrameTitle>
                        Data-Centric Curation & Leakage Prevention Pipeline
                      </FrameTitle>
                      <FrameDescription>
                        Interactive inspection of{" "}
                        <span className="font-mono">prepare_dataset.py</span>{" "}
                        and <span className="font-mono">pseudo_label.py</span>{" "}
                        stages
                      </FrameDescription>
                    </div>
                    <Badge variant="success-light">0 Train/Val Leaks</Badge>
                  </div>
                </FrameHeader>
                <FramePanel>
                  <Stepper
                    value={curationStep}
                    onValueChange={setCurationStep}
                    className="flex flex-col gap-6"
                  >
                    <StepperNav>
                      <StepperItem step={1}>
                        <StepperTrigger>
                          <StepperIndicator>1</StepperIndicator>
                          <div className="hidden flex-col items-start text-left sm:flex">
                            <StepperTitle>BLAKE2b Deduplication</StepperTitle>
                            <StepperDescription>0 duplicates</StepperDescription>
                          </div>
                        </StepperTrigger>
                        <StepperSeparator />
                      </StepperItem>

                      <StepperItem step={2}>
                        <StepperTrigger>
                          <StepperIndicator>2</StepperIndicator>
                          <div className="hidden flex-col items-start text-left sm:flex">
                            <StepperTitle>EXIF & Box Geometry</StepperTitle>
                            <StepperDescription>0 transposed</StepperDescription>
                          </div>
                        </StepperTrigger>
                        <StepperSeparator />
                      </StepperItem>

                      <StepperItem step={3}>
                        <StepperTrigger>
                          <StepperIndicator>3</StepperIndicator>
                          <div className="hidden flex-col items-start text-left sm:flex">
                            <StepperTitle>Burst Sequence Split</StepperTitle>
                            <StepperDescription>0 burst groups</StepperDescription>
                          </div>
                        </StepperTrigger>
                        <StepperSeparator />
                      </StepperItem>

                      <StepperItem step={4}>
                        <StepperTrigger>
                          <StepperIndicator>4</StepperIndicator>
                          <div className="hidden flex-col items-start text-left sm:flex">
                            <StepperTitle>GPU Pseudo-Labeling</StepperTitle>
                            <StepperDescription>0 mined boxes</StepperDescription>
                          </div>
                        </StepperTrigger>
                      </StepperItem>
                    </StepperNav>

                    <StepperPanel>
                      <StepperContent value={1}>
                        <div className="grid grid-cols-1 gap-4 rounded-lg border bg-muted/20 p-4 md:grid-cols-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-muted-foreground">
                              Cryptographic Digest Engine
                            </span>
                            <span className="font-mono text-sm font-semibold">
                              BLAKE2b (64-byte digest)
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Identifies byte-identical frames across{" "}
                              <span className="font-mono">ds1_simplex</span> and{" "}
                              <span className="font-mono">ds2_complex</span>.
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-muted-foreground">
                              Duplicate Frames Eliminated
                            </span>
                            <span className="font-mono text-lg font-semibold tabular-nums">
                              0 / 0 (0.0%)
                            </span>
                            <span className="text-xs text-muted-foreground">
                              0 conflicting multi-dataset label files reconciled
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-muted-foreground">
                              Cross-Split Leakage Blocked
                            </span>
                            <span className="font-mono text-lg font-semibold tabular-nums">
                              0 Holdout Collisions
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Test split priority enforced before train/val
                              allocation
                            </span>
                          </div>
                        </div>
                      </StepperContent>

                      <StepperContent value={2}>
                        <div className="grid grid-cols-1 gap-4 rounded-lg border bg-muted/20 p-4 md:grid-cols-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-muted-foreground">
                              EXIF Orientation Normalization
                            </span>
                            <span className="font-mono text-lg font-semibold tabular-nums">
                              0 Transposed · 0 Hardlinked
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Tag 0x0112 checked prior to zero-copy hardlinking
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-muted-foreground">
                              Degenerate Box Filtering
                            </span>
                            <span className="font-mono text-lg font-semibold tabular-nums">
                              0 Dropped (&lt; 0.0 px)
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Supervisely JSON rectangles clamped to image
                              bounds
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-medium text-muted-foreground">
                              Polygon-to-Box Conversion
                            </span>
                            <span className="font-mono text-lg font-semibold tabular-nums">
                              0 Polygons Converted
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Controlled via{" "}
                              <span className="font-mono">
                                --polygons-to-boxes
                              </span>
                            </span>
                          </div>
                        </div>
                      </StepperContent>

                      <StepperContent value={3}>
                        <div className="grid grid-cols-1 gap-4 rounded-lg border bg-muted/20 p-4 md:grid-cols-3">
                          <div className="flex flex-col gap-2">
                            <NumberField
                              size="sm"
                              value={valRatio}
                              onValueChange={(v) => setValRatio(v ?? 0)}
                              min={0}
                              max={0.5}
                              step={0.05}
                            >
                              <NumberFieldScrubArea label="Validation Split Ratio (--val-ratio)" />
                              <NumberFieldGroup>
                                <NumberFieldDecrement />
                                <NumberFieldInput />
                                <NumberFieldIncrement />
                              </NumberFieldGroup>
                            </NumberField>
                          </div>
                          <div className="flex flex-col gap-2">
                            <NumberField
                              size="sm"
                              value={maxBurstGap}
                              onValueChange={(v) => setMaxBurstGap(v ?? 0)}
                              min={0}
                              max={60}
                              step={5}
                            >
                              <NumberFieldScrubArea label="Max Camera Burst Gap (--max-burst-gap)" />
                              <NumberFieldGroup>
                                <NumberFieldDecrement />
                                <NumberFieldInput />
                                <NumberFieldIncrement />
                              </NumberFieldGroup>
                            </NumberField>
                          </div>
                          <div className="flex flex-col justify-center gap-1">
                            <span className="text-xs font-medium text-muted-foreground">
                              Sequence-Aware Grouping
                            </span>
                            <span className="font-mono text-sm font-semibold tabular-nums">
                              0 GoPro/Dashcam Bursts Isolated
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Consecutive frames stay in the same split
                            </span>
                          </div>
                        </div>
                      </StepperContent>

                      <StepperContent value={4}>
                        <div className="grid grid-cols-1 gap-4 rounded-lg border bg-muted/20 p-4 md:grid-cols-3">
                          <div className="flex flex-col gap-2">
                            <NumberField
                              size="sm"
                              value={pseudoConf}
                              onValueChange={(v) => setPseudoConf(v ?? 0)}
                              min={0}
                              max={1}
                              step={0.05}
                            >
                              <NumberFieldScrubArea label="Mining Confidence (--conf)" />
                              <NumberFieldGroup>
                                <NumberFieldDecrement />
                                <NumberFieldInput />
                                <NumberFieldIncrement />
                              </NumberFieldGroup>
                            </NumberField>
                          </div>
                          <div className="flex flex-col justify-center gap-1">
                            <span className="text-xs font-medium text-muted-foreground">
                              Unannotated Candidates Scanned
                            </span>
                            <span className="font-mono text-lg font-semibold tabular-nums">
                              0 Candidates · 0 Accepted
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Min normalized area threshold: 0.0000
                            </span>
                          </div>
                          <div className="flex items-center justify-end">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() =>
                                toast.info(
                                  "Pseudo-label mining batch finished: 0 candidates accepted."
                                )
                              }
                            >
                              <SparklesIcon />
                              Run Pseudo-Label Miner (0)
                            </Button>
                          </div>
                        </div>
                      </StepperContent>
                    </StepperPanel>
                  </Stepper>
                </FramePanel>
              </Frame>

              {/* Dataset Group Breakdown DataGrid */}
              <Frame spacing="default">
                <FrameHeader>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <FrameTitle>
                        Dataset Split & Sequence Integrity Matrix
                      </FrameTitle>
                      <FrameDescription>
                        Per-group frame counts, BLAKE2b deduplication, and
                        sequence leakage audit
                      </FrameDescription>
                    </div>
                    <Badge variant="outline">0 Total Images</Badge>
                  </div>
                </FrameHeader>
                <FramePanel className="p-0">
                  <DataGrid
                    table={curationTable}
                    recordCount={
                      showZeroPlaceholderRows
                        ? ZERO_DATASET_GROUP_RECORDS.length
                        : 0
                    }
                    isLoading={isSimulatingLoad}
                    tableLayout={{
                      headerSticky: true,
                      columnsResizable: true,
                      dense: true,
                    }}
                    tableClassNames={{ base: "min-w-[820px]" }}
                  >
                    <DataGridScrollArea>
                      <DataGridTable />
                    </DataGridScrollArea>
                  </DataGrid>
                </FramePanel>
              </Frame>
            </div>
          )}

          {/* ============================================================== */}
          {/* VIEW 5: GEOSPATIAL & MUNICIPAL DISPATCH (POSTGIS + KANBAN)     */}
          {/* ============================================================== */}
          {activeSection === "geospatial" && (
            <div className="flex flex-col gap-6">
              {/* Top Spatial Telemetry & PostGIS Map Frame */}
              <Frame spacing="default">
                <FrameHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <FrameTitle>
                          PostGIS Vector Map & Spatial Telemetry (Loulé
                          Municipality)
                        </FrameTitle>
                        <Badge variant="info-light">SRID 4326 · 0 Points</Badge>
                      </div>
                      <FrameDescription>
                        Real-time GPS dashcam coordinates indexed via PostgreSQL
                        + PostGIS spatial extension
                      </FrameDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">0 Active Vehicles</Badge>
                      <Badge variant="outline">0.0 km Audited</Badge>
                    </div>
                  </div>
                </FrameHeader>
                <FramePanel>
                  <div className="relative flex h-64 w-full flex-col items-center justify-center overflow-hidden rounded-lg border bg-muted/20 p-6">
                    {/* Vector Coordinate Grid */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 grid grid-cols-6 grid-rows-4"
                    >
                      {Array.from({ length: 24 }).map((_, i) => (
                        <div
                          key={i}
                          className="border-r border-b border-dashed border-border/40"
                        />
                      ))}
                    </div>

                    <div className="absolute top-3 left-3 flex flex-col gap-0.5 rounded-md border bg-background/90 px-2.5 py-1.5 font-mono text-xs tabular-nums">
                      <span>BOUNDS: 37.1378° N, -8.0197° W (Zero-Origin)</span>
                      <span>POSTGIS: ST_DWithin(geom, 0m) = 0 clusters</span>
                    </div>

                    <div className="relative z-10 flex max-w-md flex-col items-center gap-2 text-center">
                      <IconTile variant="frame" size="lg">
                        <NavigationIcon />
                      </IconTile>
                      <span className="text-sm font-semibold">
                        0 Georeferenced Pothole Markers Indexed
                      </span>
                      <p className="text-xs text-muted-foreground">
                        All spatial telemetry counters are set to 0. Drag work
                        orders across the Municipal Public Works Kanban board
                        below to test triage workflows.
                      </p>
                    </div>
                  </div>
                </FramePanel>
              </Frame>

              {/* Municipal Public Works Maintenance Kanban Board (`@reui/kanban`) */}
              <Frame spacing="default">
                <FrameHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <FrameTitle>
                        Municipal Public Works Dispatch Board
                      </FrameTitle>
                      <FrameDescription>
                        Drag and reorder zero-state anomaly tickets across
                        municipal repair stages
                      </FrameDescription>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setKanbanColumns(ZERO_KANBAN_COLUMNS)
                        toast.info("Kanban board reset to zero-state layout")
                      }}
                    >
                      <RotateCcwIcon />
                      Reset Board (0)
                    </Button>
                  </div>
                </FrameHeader>
                <FramePanel>
                  <Kanban
                    value={kanbanColumns}
                    onValueChange={setKanbanColumns}
                    getItemValue={(item) => item.id}
                  >
                    <KanbanBoard className="grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
                      {Object.entries(kanbanColumns).map(([colId, tickets]) => (
                        <KanbanColumn
                          key={colId}
                          value={colId}
                          className="rounded-lg border bg-muted/30 p-3"
                        >
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold">
                                {colId}
                              </span>
                              <Badge variant="outline">0</Badge>
                            </div>
                            <KanbanColumnHandle
                              aria-label={`Move column ${colId}`}
                            >
                              <GripVerticalIcon className="size-4 text-muted-foreground" />
                            </KanbanColumnHandle>
                          </div>

                          <KanbanColumnContent
                            value={colId}
                            className="flex min-h-36 flex-col gap-2.5"
                          >
                            {tickets.map((ticket) => (
                              <KanbanItem key={ticket.id} value={ticket.id}>
                                <KanbanItemHandle className="w-full cursor-grab rounded-lg border bg-card p-3 text-left shadow-xs">
                                  <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-mono text-xs font-semibold">
                                        {ticket.code}
                                      </span>
                                      <Badge variant="info-light">
                                        {ticket.severity}
                                      </Badge>
                                    </div>
                                    <span className="text-xs font-medium text-foreground">
                                      {ticket.title}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {ticket.corridor}
                                    </span>
                                    <div className="flex items-center justify-between border-t pt-2 font-mono text-xs text-muted-foreground tabular-nums">
                                      <span>Area: {ticket.areaPct}</span>
                                      <span>Conf: {ticket.confidence}</span>
                                    </div>
                                  </div>
                                </KanbanItemHandle>
                              </KanbanItem>
                            ))}
                          </KanbanColumnContent>
                        </KanbanColumn>
                      ))}
                    </KanbanBoard>
                    <KanbanOverlay>
                      <div className="size-full rounded-lg border bg-muted/60" />
                    </KanbanOverlay>
                  </Kanban>
                </FramePanel>
              </Frame>
            </div>
          )}

          {/* ============================================================== */}
          {/* VIEW 6: WEIGHTS & CLI REGISTRY (`@reui/code-block`)            */}
          {/* ============================================================== */}
          {activeSection === "registry" && (
            <div className="flex flex-col gap-6">
              {/* Model Checkpoints Registry DataGrid */}
              <Frame spacing="default">
                <FrameHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <FrameTitle>
                        Model Weights & Export Artifact Registry
                      </FrameTitle>
                      <FrameDescription>
                        Zero-initialized checkpoints for PyTorch, ONNX Runtime,
                        and NVIDIA TensorRT
                      </FrameDescription>
                    </div>
                    <Badge variant="outline">0.0 MB Total Storage</Badge>
                  </div>
                </FrameHeader>
                <FramePanel className="p-0">
                  <DataGrid
                    table={registryTable}
                    recordCount={
                      showZeroPlaceholderRows
                        ? ZERO_MODEL_CHECKPOINTS.length
                        : 0
                    }
                    isLoading={isSimulatingLoad}
                    tableLayout={{
                      headerSticky: true,
                      columnsResizable: true,
                      dense: true,
                    }}
                    tableClassNames={{ base: "min-w-[800px]" }}
                  >
                    <DataGridScrollArea>
                      <DataGridTable />
                    </DataGridScrollArea>
                  </DataGrid>
                </FramePanel>
              </Frame>

              {/* Code Blocks for Reproducible CLI & PostGIS Schema */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Frame spacing="default">
                  <FrameHeader>
                    <FrameTitle>Dataset Configuration (data.yaml)</FrameTitle>
                    <FrameDescription>
                      Zero-initialized YOLO dataset configuration
                    </FrameDescription>
                  </FrameHeader>
                  <FramePanel>
                    <CodeBlock
                      code={DATA_YAML_SNIPPET}
                      language="yaml"
                      showLineNumbers
                      variant="ghost"
                    >
                      <CodeBlockHeader>
                        <CodeBlockTitle>dataset_yolo/data.yaml</CodeBlockTitle>
                        <CodeBlockLanguage />
                        <CodeBlockCopyButton className="ml-auto" />
                      </CodeBlockHeader>
                    </CodeBlock>
                  </FramePanel>
                </Frame>

                <Frame spacing="default">
                  <FrameHeader>
                    <FrameTitle>Training Pipeline CLI (train.py)</FrameTitle>
                    <FrameDescription>
                      Zero-state hyperparameter invocation
                    </FrameDescription>
                  </FrameHeader>
                  <FramePanel>
                    <CodeBlock
                      code={TRAIN_CLI_SNIPPET}
                      language="bash"
                      showLineNumbers
                      variant="ghost"
                    >
                      <CodeBlockHeader>
                        <CodeBlockTitle>train.py</CodeBlockTitle>
                        <CodeBlockLanguage />
                        <CodeBlockCopyButton className="ml-auto" />
                      </CodeBlockHeader>
                    </CodeBlock>
                  </FramePanel>
                </Frame>

                <Frame spacing="default">
                  <FrameHeader>
                    <FrameTitle>Inference Engine CLI (predict.py)</FrameTitle>
                    <FrameDescription>
                      Dashcam & image batch evaluation command
                    </FrameDescription>
                  </FrameHeader>
                  <FramePanel>
                    <CodeBlock
                      code={PREDICT_CLI_SNIPPET}
                      language="bash"
                      showLineNumbers
                      variant="ghost"
                    >
                      <CodeBlockHeader>
                        <CodeBlockTitle>predict.py</CodeBlockTitle>
                        <CodeBlockLanguage />
                        <CodeBlockCopyButton className="ml-auto" />
                      </CodeBlockHeader>
                    </CodeBlock>
                  </FramePanel>
                </Frame>

                <Frame spacing="default">
                  <FrameHeader>
                    <FrameTitle>PostGIS Spatial Telemetry Schema</FrameTitle>
                    <FrameDescription>
                      PostgreSQL + PostGIS table definition (0 rows)
                    </FrameDescription>
                  </FrameHeader>
                  <FramePanel>
                    <CodeBlock
                      code={POSTGIS_SCHEMA_SNIPPET}
                      language="sql"
                      showLineNumbers
                      variant="ghost"
                    >
                      <CodeBlockHeader>
                        <CodeBlockTitle>schema.sql</CodeBlockTitle>
                        <CodeBlockLanguage />
                        <CodeBlockCopyButton className="ml-auto" />
                      </CodeBlockHeader>
                    </CodeBlock>
                  </FramePanel>
                </Frame>
              </div>
            </div>
          )}
        </div>
      </SidebarInset>

      {/* ================================================================== */}
      {/* RIGHT-HAND ANOMALY TELEMETRY INSPECTOR SHEET                       */}
      {/* ================================================================== */}
      <Sheet
        open={inspectedDetection !== null}
        onOpenChange={(open) => {
          if (!open) setInspectedDetection(null)
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <div className="flex items-center gap-2">
              <SheetTitle>
                Anomaly Telemetry{" "}
                {inspectedDetection?.id ?? "DET-0000"}
              </SheetTitle>
              <Badge variant="info-light">All Values = 0</Badge>
            </div>
            <SheetDescription>
              Full bounding-box geometry, EXIF GPS coordinates, and speed
              breakdown
            </SheetDescription>
          </SheetHeader>

          {inspectedDetection && (
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
              <Frame spacing="sm">
                <FramePanel>
                  <div className="flex flex-col gap-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Frame File</span>
                      <span className="font-mono font-medium">
                        {inspectedDetection.frameId}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Corridor</span>
                      <span>{inspectedDetection.corridor}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Vehicle Unit
                      </span>
                      <span className="font-mono">
                        {inspectedDetection.vehicleUnit}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        YOLO Class ID
                      </span>
                      <span className="font-mono">
                        {inspectedDetection.classId} (
                        {inspectedDetection.className})
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Confidence</span>
                      <span className="font-mono tabular-nums">
                        {inspectedDetection.confidence.toFixed(4)} (0.0%)
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Bounding Box
                      </span>
                      <span className="font-mono tabular-nums">
                        {inspectedDetection.bbox}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Box Dimensions
                      </span>
                      <span className="font-mono tabular-nums">
                        {inspectedDetection.sizePx} px
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Frame Area Coverage
                      </span>
                      <span className="font-mono font-semibold tabular-nums">
                        {inspectedDetection.areaPct.toFixed(3)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        PostGIS Coordinates
                      </span>
                      <span className="font-mono tabular-nums">
                        {inspectedDetection.latitude.toFixed(6)}° N,{" "}
                        {inspectedDetection.longitude.toFixed(6)}° W
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        Inference Latency
                      </span>
                      <span className="font-mono tabular-nums">
                        {inspectedDetection.speedMs.toFixed(1)} ms
                      </span>
                    </div>
                  </div>
                </FramePanel>
              </Frame>
            </div>
          )}

          <SheetFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setInspectedDetection(null)}
            >
              Close Inspector
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* ================================================================== */}
      {/* PIPELINE EXECUTION WIZARD DIALOG (`@reui/stepper` inside `Dialog`) */}
      {/* ================================================================== */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Launch SIRI-DL Pipeline Job</DialogTitle>
            <DialogDescription>
              Configure a zero-initialized dataset curation, training, or
              inference execution step.
            </DialogDescription>
          </DialogHeader>

          <Stepper
            value={wizardStep}
            onValueChange={setWizardStep}
            className="flex flex-col gap-4 py-2"
          >
            <StepperNav>
              <StepperItem step={1}>
                <StepperTrigger>
                  <StepperIndicator>1</StepperIndicator>
                  <StepperTitle>Stage</StepperTitle>
                </StepperTrigger>
                <StepperSeparator />
              </StepperItem>
              <StepperItem step={2}>
                <StepperTrigger>
                  <StepperIndicator>2</StepperIndicator>
                  <StepperTitle>Parameters (0)</StepperTitle>
                </StepperTrigger>
                <StepperSeparator />
              </StepperItem>
              <StepperItem step={3}>
                <StepperTrigger>
                  <StepperIndicator>3</StepperIndicator>
                  <StepperTitle>Confirm</StepperTitle>
                </StepperTrigger>
              </StepperItem>
            </StepperNav>

            <StepperPanel>
              <StepperContent value={1}>
                <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 text-xs">
                  <span className="font-medium">
                    1. Select SIRI-DL Python Pipeline Module:
                  </span>
                  <span className="font-mono text-muted-foreground">
                    • prepare_dataset.py (BLAKE2b + Burst Split: 0 images)
                  </span>
                  <span className="font-mono text-muted-foreground">
                    • pseudo_label.py (Semi-Supervised GPU Mining: 0 boxes)
                  </span>
                  <span className="font-mono text-muted-foreground">
                    • train.py (YOLOv11s 1280px Training: 0 epochs)
                  </span>
                  <span className="font-mono text-muted-foreground">
                    • predict.py (Dashcam Stream Detector: 0 detections)
                  </span>
                </div>
              </StepperContent>
              <StepperContent value={2}>
                <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 font-mono text-xs tabular-nums">
                  <span>--epochs 0 --batch 0 --imgsz 0</span>
                  <span>--conf 0.00 --iou 0.00 --max-det 0</span>
                  <span>--val-ratio 0.00 --max-burst-gap 0</span>
                </div>
              </StepperContent>
              <StepperContent value={3}>
                <Alert variant="success">
                  <CheckCircle2Icon />
                  <AlertTitle>Ready for Dry-Run Dispatch</AlertTitle>
                  <AlertDescription>
                    All pipeline parameters are verified at 0. Execution will
                    preserve the zero-state telemetry baseline.
                  </AlertDescription>
                </Alert>
              </StepperContent>
            </StepperPanel>
          </Stepper>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={wizardStep <= 1}
              onClick={() => setWizardStep((s) => Math.max(1, s - 1))}
            >
              Back
            </Button>
            {wizardStep < 3 ? (
              <Button
                type="button"
                size="sm"
                onClick={() => setWizardStep((s) => Math.min(3, s + 1))}
              >
                Next
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setWizardOpen(false)
                  toast.success(
                    "Pipeline dry-run completed (0 items processed)"
                  )
                }}
              >
                Execute Pipeline (0)
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================== */}
      {/* COMMAND PALETTE (`CommandDialog` wrapping `Command`)               */}
      {/* ================================================================== */}
      <CommandDialog
        open={commandOpen}
        onOpenChange={setCommandOpen}
        title="SIRI-DL Command Palette"
        description="Jump to any dashboard view or reset zero-state parameters"
      >
        <Command>
          <CommandInput placeholder="Type a command or search views..." />
          <CommandList>
            <CommandEmpty>No matching commands found.</CommandEmpty>
            <CommandGroup heading="Navigation Views">
              {NAV_SECTIONS.map((sec) => {
                const Icon = sec.icon
                return (
                  <CommandItem
                    key={sec.id}
                    onSelect={() => {
                      setActiveSection(sec.id)
                      setCommandOpen(false)
                    }}
                  >
                    <Icon />
                    <span>{sec.label}</span>
                    <CommandShortcut>{sec.badge}</CommandShortcut>
                  </CommandItem>
                )
              })}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Zero-State Operations">
              <CommandItem
                onSelect={() => {
                  handleResetAllZero()
                  setCommandOpen(false)
                }}
              >
                <RotateCcwIcon />
                <span>Reset All Telemetry & Thresholds to 0</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setShowZeroPlaceholderRows((prev) => !prev)
                  setCommandOpen(false)
                }}
              >
                <LayersIcon />
                <span>Toggle Zero-Initialized Table Rows vs Empty State</span>
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  handleToggleTheme()
                  setCommandOpen(false)
                }}
              >
                {isDark ? <SunIcon /> : <MoonIcon />}
                <span>Toggle Dark / Light Appearance</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </SidebarProvider>
  )
}
