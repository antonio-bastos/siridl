import type { FilterField } from "@/components/reui/filters/filters-types"

export type DashboardSectionId =
  | "overview"
  | "inference"
  | "training"
  | "curation"
  | "geospatial"
  | "registry"

export interface DetectionRecord {
  id: string
  frameId: string
  timestamp: string
  corridor: string
  vehicleUnit: string
  classId: number
  className: string
  confidence: number
  bbox: string
  sizePx: string
  areaPct: number
  severity: "None" | "Low" | "Medium" | "High" | "Critical"
  latitude: number
  longitude: number
  speedMs: number
  status: "Pending" | "Verified" | "Dispatched"
}

export interface EpochRecord {
  epoch: number
  trainBoxLoss: number
  trainClsLoss: number
  trainDflLoss: number
  valBoxLoss: number
  valClsLoss: number
  valDflLoss: number
  precision: number
  recall: number
  map50: number
  map50_95: number
  lrPg0: number
  vramGb: number
  epochTimeSec: number
}

export interface DatasetGroupRecord {
  group: string
  split: "train" | "val" | "test"
  scannedFrames: number
  validBoxes: number
  blake2bDupes: number
  exifTransposed: number
  burstClusters: number
  negativesAdded: number
  leakageCount: number
  medianAreaPct: number
}

export interface KanbanTicket {
  id: string
  code: string
  title: string
  corridor: string
  gps: string
  areaPct: string
  confidence: string
  severity: string
  unit: string
  updatedAt: string
}

export interface ModelCheckpointRecord {
  id: string
  checkpointName: string
  architecture: string
  format: "PyTorch (.pt)" | "ONNX (.onnx)" | "TensorRT (.engine)" | "OpenVINO"
  resolutionPx: number
  precisionFp: "FP16" | "FP32" | "INT8"
  map50: number
  map50_95: number
  latencyMs: number
  throughputFps: number
  fileSizeMb: number
  status: "Standby" | "Awaiting Weights" | "Export Ready"
}

/**
 * All telemetry, evaluation, curation, and spatial metrics initialized to 0
 * per strict zero-state specification.
 */
export const ZERO_OVERVIEW_KPIS = [
  {
    id: "kpi-frames",
    title: "Frames Evaluated",
    value: "0",
    unit: "frames",
    delta: "0.0%",
    meta: "0.0 FPS stream rate",
    pipelineRef: "predict.py --imgsz 1280",
    badge: "Standby",
    badgeVariant: "info-light" as const,
  },
  {
    id: "kpi-anomalies",
    title: "Detected Anomalies",
    value: "0",
    unit: "potholes",
    delta: "0.0%",
    meta: "0 critical · 0 moderate · 0 minor",
    pipelineRef: "class_id: 0 (pothole)",
    badge: "0 Active",
    badgeVariant: "outline" as const,
  },
  {
    id: "kpi-map50",
    title: "Validation mAP@50",
    value: "0.000",
    unit: "IoU=0.50",
    delta: "0.000",
    meta: "mAP@50-95: 0.000 · Recall: 0.000",
    pipelineRef: "train.py --eval-split test",
    badge: "Epoch 0 / 0",
    badgeVariant: "outline" as const,
  },
  {
    id: "kpi-latency",
    title: "Inference Latency",
    value: "0.0",
    unit: "ms / img",
    delta: "0.0 ms",
    meta: "Pre: 0.0ms · Inf: 0.0ms · NMS: 0.0ms",
    pipelineRef: "CUDA:0 FP16 · 0.0 GB VRAM",
    badge: "0.0 FPS",
    badgeVariant: "success-light" as const,
  },
]

export const ZERO_TRAINING_KPIS = [
  {
    id: "trn-map50",
    title: "Validation mAP@50",
    value: "0.0000",
    sub: "Best checkpoint epoch: 0",
    badge: "0.0%",
  },
  {
    id: "trn-map95",
    title: "mAP@50:95 (Strict)",
    value: "0.0000",
    sub: "IoU 0.50 to 0.95 step 0.05",
    badge: "0.0%",
  },
  {
    id: "trn-loss",
    title: "Total Validation Loss",
    value: "0.0000",
    sub: "Box: 0.000 · Cls: 0.000 · DFL: 0.000",
    badge: "0.000",
  },
  {
    id: "trn-vram",
    title: "GPU VRAM Footprint",
    value: "0.0 GB",
    sub: "Batch: 0 · Workers: 0 · ImgSz: 0 px",
    badge: "0% Util",
  },
]

export const ZERO_CURATION_KPIS = [
  {
    id: "cur-scanned",
    title: "Raw Frames Scanned",
    value: "0",
    sub: "ds1_simplex + ds2_complex",
    badge: "0 Bytes",
  },
  {
    id: "cur-dupes",
    title: "BLAKE2b Duplicates",
    value: "0",
    sub: "0 cross-split leakage conflicts",
    badge: "0.0% Dupes",
  },
  {
    id: "cur-bursts",
    title: "Camera Burst Clusters",
    value: "0",
    sub: "Max burst gap: 0 frames",
    badge: "0 Leaks",
  },
  {
    id: "cur-pseudo",
    title: "Pseudo-Labels Mined",
    value: "0",
    sub: "Accepted: 0 · Rejected: 0 · Conf: 0.00",
    badge: "0 Batches",
  },
]

/**
 * Filter schema for the Anomaly Detection DataGrid (`@reui/filters`)
 */
export const DETECTION_FILTER_FIELDS: FilterField[] = [
  {
    id: "frameId",
    label: "Frame ID",
    type: "text",
    placeholder: "e.g. GOPR0000.jpg",
  },
  {
    id: "corridor",
    label: "Road Corridor",
    type: "select",
    options: [
      { value: "EN125-Loule-Oeste", label: "EN125 Loulé Oeste (0)" },
      { value: "Av-Jose-da-Costa-Mealha", label: "Av. José da Costa Mealha (0)" },
      { value: "EM522-Almancil", label: "EM522 Almancil (0)" },
      { value: "Circular-Norte-Loule", label: "Circular Norte de Loulé (0)" },
    ],
  },
  {
    id: "severity",
    label: "Severity Tier",
    type: "select",
    options: [
      { value: "Critical", label: "Critical (>5.0% area) — 0" },
      { value: "High", label: "High (2.0%–5.0% area) — 0" },
      { value: "Medium", label: "Medium (0.5%–2.0% area) — 0" },
      { value: "Low", label: "Low (<0.5% area) — 0" },
      { value: "None", label: "None (0.0% area) — 0" },
    ],
  },
  {
    id: "confidence",
    label: "Confidence Score",
    type: "number",
  },
  {
    id: "areaPct",
    label: "Surface Area (%)",
    type: "number",
  },
  {
    id: "status",
    label: "Dispatch Status",
    type: "select",
    options: [
      { value: "Pending", label: "Pending Triage (0)" },
      { value: "Verified", label: "Verified Anomaly (0)" },
      { value: "Dispatched", label: "Crew Dispatched (0)" },
    ],
  },
]

/**
 * Zero-Placeholder Records (optional toggle so user can inspect 0-filled rows or pure empty state)
 */
export const ZERO_DETECTION_RECORDS: DetectionRecord[] = [
  {
    id: "DET-0000-A",
    frameId: "FRAME_00000000.jpg",
    timestamp: "0000-00-00 00:00:00",
    corridor: "EN125-Loule-Oeste (KM 0.0)",
    vehicleUnit: "VTR-00 (Dashcam #0)",
    classId: 0,
    className: "pothole",
    confidence: 0.0,
    bbox: "(0, 0, 0, 0)",
    sizePx: "0 × 0",
    areaPct: 0.0,
    severity: "None",
    latitude: 0.0,
    longitude: 0.0,
    speedMs: 0.0,
    status: "Pending",
  },
  {
    id: "DET-0000-B",
    frameId: "GOPR00000000.jpg",
    timestamp: "0000-00-00 00:00:00",
    corridor: "Av. José da Costa Mealha (KM 0.0)",
    vehicleUnit: "VTR-00 (Dashcam #0)",
    classId: 0,
    className: "pothole",
    confidence: 0.0,
    bbox: "(0, 0, 0, 0)",
    sizePx: "0 × 0",
    areaPct: 0.0,
    severity: "None",
    latitude: 0.0,
    longitude: 0.0,
    speedMs: 0.0,
    status: "Pending",
  },
  {
    id: "DET-0000-C",
    frameId: "IMG_00000000.jpg",
    timestamp: "0000-00-00 00:00:00",
    corridor: "EM522 Almancil-Quarteira (KM 0.0)",
    vehicleUnit: "VTR-00 (Dashcam #0)",
    classId: 0,
    className: "pothole",
    confidence: 0.0,
    bbox: "(0, 0, 0, 0)",
    sizePx: "0 × 0",
    areaPct: 0.0,
    severity: "None",
    latitude: 0.0,
    longitude: 0.0,
    speedMs: 0.0,
    status: "Pending",
  },
  {
    id: "DET-0000-D",
    frameId: "DSC_00000000.jpg",
    timestamp: "0000-00-00 00:00:00",
    corridor: "Circular Norte de Loulé (KM 0.0)",
    vehicleUnit: "VTR-00 (Dashcam #0)",
    classId: 0,
    className: "pothole",
    confidence: 0.0,
    bbox: "(0, 0, 0, 0)",
    sizePx: "0 × 0",
    areaPct: 0.0,
    severity: "None",
    latitude: 0.0,
    longitude: 0.0,
    speedMs: 0.0,
    status: "Pending",
  },
]

export const ZERO_EPOCH_RECORDS: EpochRecord[] = [
  {
    epoch: 0,
    trainBoxLoss: 0.0,
    trainClsLoss: 0.0,
    trainDflLoss: 0.0,
    valBoxLoss: 0.0,
    valClsLoss: 0.0,
    valDflLoss: 0.0,
    precision: 0.0,
    recall: 0.0,
    map50: 0.0,
    map50_95: 0.0,
    lrPg0: 0.0,
    vramGb: 0.0,
    epochTimeSec: 0.0,
  },
]

export const ZERO_DATASET_GROUP_RECORDS: DatasetGroupRecord[] = [
  {
    group: "ds1_simplex-train",
    split: "train",
    scannedFrames: 0,
    validBoxes: 0,
    blake2bDupes: 0,
    exifTransposed: 0,
    burstClusters: 0,
    negativesAdded: 0,
    leakageCount: 0,
    medianAreaPct: 0.0,
  },
  {
    group: "ds2_complex-train",
    split: "train",
    scannedFrames: 0,
    validBoxes: 0,
    blake2bDupes: 0,
    exifTransposed: 0,
    burstClusters: 0,
    negativesAdded: 0,
    leakageCount: 0,
    medianAreaPct: 0.0,
  },
  {
    group: "ds1_simplex-val (sequence-grouped)",
    split: "val",
    scannedFrames: 0,
    validBoxes: 0,
    blake2bDupes: 0,
    exifTransposed: 0,
    burstClusters: 0,
    negativesAdded: 0,
    leakageCount: 0,
    medianAreaPct: 0.0,
  },
  {
    group: "ds2_complex-val (sequence-grouped)",
    split: "val",
    scannedFrames: 0,
    validBoxes: 0,
    blake2bDupes: 0,
    exifTransposed: 0,
    burstClusters: 0,
    negativesAdded: 0,
    leakageCount: 0,
    medianAreaPct: 0.0,
  },
  {
    group: "ds1_simplex-test (holdout)",
    split: "test",
    scannedFrames: 0,
    validBoxes: 0,
    blake2bDupes: 0,
    exifTransposed: 0,
    burstClusters: 0,
    negativesAdded: 0,
    leakageCount: 0,
    medianAreaPct: 0.0,
  },
  {
    group: "ds2_complex-test (holdout)",
    split: "test",
    scannedFrames: 0,
    validBoxes: 0,
    blake2bDupes: 0,
    exifTransposed: 0,
    burstClusters: 0,
    negativesAdded: 0,
    leakageCount: 0,
    medianAreaPct: 0.0,
  },
]

export const ZERO_KANBAN_COLUMNS: Record<string, KanbanTicket[]> = {
  "Unverified Detections (0)": [
    {
      id: "ticket-zero-1",
      code: "WO-0000",
      title: "Zero-State Telemetry Slot #1",
      corridor: "EN125 Loulé Oeste · KM 0.0",
      gps: "0.000000° N, 0.000000° W",
      areaPct: "0.00%",
      confidence: "0.0%",
      severity: "0.00 Severity",
      unit: "VTR-00",
      updatedAt: "0m ago",
    },
  ],
  "Severity Triage (0)": [
    {
      id: "ticket-zero-2",
      code: "WO-0000",
      title: "Zero-State Triage Slot #2",
      corridor: "Av. José da Costa Mealha · KM 0.0",
      gps: "0.000000° N, 0.000000° W",
      areaPct: "0.00%",
      confidence: "0.0%",
      severity: "0.00 Severity",
      unit: "VTR-00",
      updatedAt: "0m ago",
    },
  ],
  "Municipal Dispatch (0)": [
    {
      id: "ticket-zero-3",
      code: "WO-0000",
      title: "Zero-State Crew Dispatch #3",
      corridor: "EM522 Almancil · KM 0.0",
      gps: "0.000000° N, 0.000000° W",
      areaPct: "0.00%",
      confidence: "0.0%",
      severity: "0.00 Severity",
      unit: "VTR-00",
      updatedAt: "0m ago",
    },
  ],
  "Resurfaced & Verified (0)": [
    {
      id: "ticket-zero-4",
      code: "WO-0000",
      title: "Zero-State Audit Verification #4",
      corridor: "Circular Norte Loulé · KM 0.0",
      gps: "0.000000° N, 0.000000° W",
      areaPct: "0.00%",
      confidence: "0.0%",
      severity: "0.00 Severity",
      unit: "VTR-00",
      updatedAt: "0m ago",
    },
  ],
}

export const ZERO_MODEL_CHECKPOINTS: ModelCheckpointRecord[] = [
  {
    id: "chk-yolo11s-best",
    checkpointName: "runs/pothole/baseline/weights/best.pt",
    architecture: "YOLOv11s (Ultralytics)",
    format: "PyTorch (.pt)",
    resolutionPx: 0,
    precisionFp: "FP16",
    map50: 0.0,
    map50_95: 0.0,
    latencyMs: 0.0,
    throughputFps: 0.0,
    fileSizeMb: 0.0,
    status: "Awaiting Weights",
  },
  {
    id: "chk-yolo11s-last",
    checkpointName: "runs/pothole/baseline/weights/last.pt",
    architecture: "YOLOv11s (Ultralytics)",
    format: "PyTorch (.pt)",
    resolutionPx: 0,
    precisionFp: "FP16",
    map50: 0.0,
    map50_95: 0.0,
    latencyMs: 0.0,
    throughputFps: 0.0,
    fileSizeMb: 0.0,
    status: "Standby",
  },
  {
    id: "chk-yolo11s-onnx",
    checkpointName: "runs/pothole/baseline/weights/best.onnx",
    architecture: "YOLOv11s ONNX Runtime",
    format: "ONNX (.onnx)",
    resolutionPx: 0,
    precisionFp: "FP16",
    map50: 0.0,
    map50_95: 0.0,
    latencyMs: 0.0,
    throughputFps: 0.0,
    fileSizeMb: 0.0,
    status: "Export Ready",
  },
  {
    id: "chk-yolo11s-trt",
    checkpointName: "runs/pothole/baseline/weights/best.engine",
    architecture: "YOLOv11s TensorRT RTX",
    format: "TensorRT (.engine)",
    resolutionPx: 0,
    precisionFp: "FP16",
    map50: 0.0,
    map50_95: 0.0,
    latencyMs: 0.0,
    throughputFps: 0.0,
    fileSizeMb: 0.0,
    status: "Export Ready",
  },
]

export const DATA_YAML_SNIPPET = `# dataset_yolo/data.yaml — SIRI-DL Zero-Initialized Schema
path: C:/Users/anton/Documents/siridl/dataset_yolo
train: images/train  # 0 images (0 positive, 0 background)
val: images/val      # 0 images (0 sequence bursts)
test: images/test    # 0 images (holdout evaluation split)

nc: 1
names:
  0: pothole`

export const TRAIN_CLI_SNIPPET = `python train.py \\
  --model weights/yolo11s.pt \\
  --data dataset_yolo/data.yaml \\
  --epochs 0 \\
  --imgsz 0 \\
  --batch 0 \\
  --patience 0 \\
  --scale 0.0 \\
  --mixup 0.0 \\
  --mosaic 0.0 \\
  --close-mosaic 0 \\
  --eval-split test`

export const PREDICT_CLI_SNIPPET = `python predict.py assets/reference.jpg \\
  --model runs/pothole/baseline/weights/best.pt \\
  --conf 0.00 \\
  --iou 0.00 \\
  --imgsz 0 \\
  --max-det 0 \\
  --json --csv --save-crops`

export const POSTGIS_SCHEMA_SNIPPET = `-- PostGIS Spatial Telemetry Table (0 rows indexed)
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS road_anomalies (
  anomaly_id UUID PRIMARY KEY,
  frame_id VARCHAR(128) NOT NULL,
  class_id SMALLINT DEFAULT 0,
  confidence NUMERIC(5,4) DEFAULT 0.0000,
  area_pct NUMERIC(6,3) DEFAULT 0.000,
  severity_score NUMERIC(5,2) DEFAULT 0.00,
  geom GEOMETRY(Point, 4326),
  captured_at TIMESTAMPTZ DEFAULT NOW()
);

SELECT COUNT(*) AS total_anomalies,
       COALESCE(AVG(confidence), 0) AS mean_conf,
       COALESCE(SUM(area_pct), 0) AS total_area_pct
FROM road_anomalies;
-- Result: total_anomalies = 0 | mean_conf = 0.0000 | total_area_pct = 0.000`
