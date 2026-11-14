#!/usr/bin/env python3
"""SIRI Pothole Detection & High-Performance Inference Pipeline.

Real-time road anomaly detection using YOLO, PyTorch, and CUDA with:
- Persistent model & GPU context management (zero reload across predictions)
- Fast C++/CUDA torchvision NMS loading (eliminating ~1.1s import overhead)
- Separate Cold-Start vs. Warm-Prediction lifecycle instrumentation
- Interactive REPL, folder-watch, batch, video stream, and benchmark modes

Usage examples:
    python predict.py assets/reference.jpg
    python predict.py "dashcam/*.jpg" --batch-size 4 --json --csv
    python predict.py --interactive
    python predict.py --benchmark
    python predict.py drive.mp4 --imgsz 1280
"""

from __future__ import annotations

import time

# --- Stage 0: Process Startup Timestamp ---
_T_PROCESS_START = time.perf_counter()

import argparse
import csv
from dataclasses import dataclass
import gc
import json
from pathlib import Path
import sys
import types
from typing import Any, Optional

import cv2
import numpy as np
import psutil
from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
import torch


def _init_fast_torchvision_nms() -> bool:
    """Load only torchvision's C++/CUDA extension for NMS (~1 ms vs ~1,100 ms full import).

    Ultralytics runs `import torchvision` inside AutoBackend.warmup() solely to enable
    `torchvision.ops.nms` in `ultralytics/utils/nms.py`. Importing the full `torchvision`
    package eagerly loads datasets, models, transforms, and PIL (~1.1s penalty).
    Loading `_C*.pyd` directly registers the CUDA NMS kernel in ~1 ms while preserving
    100% identical NMS outputs.
    """
    if "torchvision" in sys.modules:
        return True
    try:
        tv_dir = Path(torch.__file__).parent.parent / "torchvision"
        c_ext = next(tv_dir.glob("_C*.pyd"), None) or next(tv_dir.glob("_C*.so"), None)
        if c_ext is None:
            return False
        torch.ops.load_library(str(c_ext))
        if not hasattr(torch.ops, "torchvision") or not hasattr(torch.ops.torchvision, "nms"):
            return False
        tv_stub = types.ModuleType("torchvision")
        tv_stub.__path__ = [str(tv_dir)]
        ops_stub = types.ModuleType("torchvision.ops")
        ops_stub.nms = torch.ops.torchvision.nms
        tv_stub.ops = ops_stub
        sys.modules["torchvision"] = tv_stub
        sys.modules["torchvision.ops"] = ops_stub
        return True
    except Exception:
        return False


_FAST_NMS_LOADED = _init_fast_torchvision_nms()

from ultralytics import YOLO
from ultralytics.cfg import get_cfg, get_save_dir
from ultralytics.utils import DEFAULT_CFG_DICT, nms, ops

# Optional NVML for live GPU utilisation & VRAM telemetry
try:
    import pynvml

    pynvml.nvmlInit()
    _NVML_AVAILABLE = True
except Exception:
    _NVML_AVAILABLE = False

_T_IMPORTS_READY = time.perf_counter()
IMPORT_TIME_MS = (_T_IMPORTS_READY - _T_PROCESS_START) * 1000.0

console = Console()

URL_PREFIXES = ("http://", "https://", "rtsp://", "rtmp://")
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".bmp", ".webp")
MAX_DETAIL_IMAGES = 5
MAX_SUMMARY_ROWS = 30


# ---------------------------------------------------------
# Metrics Dataclasses
# ---------------------------------------------------------

@dataclass
class ColdStartMetrics:
    imports_ms: float = 0.0
    cuda_init_ms: float = 0.0
    model_load_ms: float = 0.0
    model_transfer_ms: float = 0.0
    warmup_ms: float = 0.0
    total_cold_ms: float = 0.0


@dataclass
class WarmPredictionMetrics:
    image_load_ms: float = 0.0
    preprocess_ms: float = 0.0
    inference_ms: float = 0.0
    postprocess_ms: float = 0.0
    bbox_conversion_ms: float = 0.0
    saving_ms: float = 0.0
    total_warm_ms: float = 0.0
    gpu_pipeline_ms: float = 0.0
    throughput_fps: float = 0.0
    gpu_fps: float = 0.0


@dataclass
class HardwareMetrics:
    device_name: str = "CPU"
    is_cuda: bool = False
    cuda_version: str = "N/A"
    cudnn_version: str = "N/A"
    precision: str = "FP32"
    resolution: int = 1280
    gpu_mem_allocated_mb: float = 0.0
    gpu_mem_peak_mb: float = 0.0
    gpu_mem_total_gb: float = 0.0
    gpu_utilization_pct: Optional[int] = None
    cpu_utilization_pct: Optional[float] = None


@dataclass
class DetectionSummary:
    total_potholes: int = 0
    images_with_potholes: int = 0
    total_images: int = 0
    mean_confidence: float = 0.0
    highest_confidence: float = 0.0
    lowest_confidence: float = 0.0


# ---------------------------------------------------------
# Hardware & Environment Utilities
# ---------------------------------------------------------

def query_hardware_metrics(device_idx: int = 0, precision: str = "FP16", resolution: int = 1280) -> HardwareMetrics:
    """Retrieve current GPU/CPU hardware, VRAM, and utilisation telemetry."""
    cpu_util = psutil.cpu_percent(interval=None)
    is_cuda = torch.cuda.is_available() and device_idx >= 0
    if not is_cuda:
        return HardwareMetrics(
            device_name="CPU",
            is_cuda=False,
            precision=precision,
            resolution=resolution,
            cpu_utilization_pct=cpu_util,
        )

    dev_name = torch.cuda.get_device_name(device_idx)
    alloc_mb = torch.cuda.memory_allocated(device_idx) / (1024 ** 2)
    peak_mb = torch.cuda.max_memory_allocated(device_idx) / (1024 ** 2)
    total_gb = torch.cuda.get_device_properties(device_idx).total_memory / (1024 ** 3)

    gpu_util = None
    if _NVML_AVAILABLE:
        try:
            handle = pynvml.nvmlDeviceGetHandleByIndex(device_idx)
            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            gpu_util = int(util.gpu)
        except Exception:
            pass

    return HardwareMetrics(
        device_name=dev_name,
        is_cuda=True,
        cuda_version=torch.version.cuda or "N/A",
        cudnn_version=str(torch.backends.cudnn.version()) if torch.backends.cudnn.is_available() else "N/A",
        precision=precision,
        resolution=resolution,
        gpu_mem_allocated_mb=alloc_mb,
        gpu_mem_peak_mb=peak_mb,
        gpu_mem_total_gb=total_gb,
        gpu_utilization_pct=gpu_util,
        cpu_utilization_pct=cpu_util,
    )


def find_latest_model() -> Path | None:
    candidates = list(Path("runs").glob("**/weights/best.pt"))
    if not candidates:
        candidates = list(Path("weights").glob("*.pt"))
    return max(candidates, key=lambda p: p.stat().st_mtime) if candidates else None


def resolve_model(path: Path | None) -> Path:
    if path is None:
        path = find_latest_model()
        if path is None:
            raise FileNotFoundError(
                "No trained weights found under runs/**/weights/best.pt or weights/*.pt.\n"
                "Train a model first or pass --model."
            )
        console.print(f"[dim]Auto-selected newest model: {path}[/dim]")
    if not path.is_file():
        raise FileNotFoundError(f"Model not found: {path}\nMake sure training completed and best.pt exists.")
    return path


def validate_source(source: str) -> None:
    if source.isdigit() or source.startswith(URL_PREFIXES) or any(c in source for c in "*?["):
        return
    if not Path(source).exists():
        raise FileNotFoundError(
            f"Source not found: {source}\n"
            "Pass an image/folder/video path, a glob, a URL, or a webcam index."
        )


def resolve_device(device: str) -> str:
    if device in ("cpu", "mps"):
        return device
    if not torch.cuda.is_available():
        console.print("[yellow]CUDA not available; falling back to CPU.[/yellow]")
        return "cpu"
    idx = int(device.split(",")[0])
    return str(idx)


def resolve_precision(precision: str, is_cuda: bool) -> str:
    if precision == "auto":
        return "FP16" if is_cuda else "FP32"
    req = precision.upper()
    if req == "FP16" and not is_cuda:
        console.print("[yellow]FP16 requested without CUDA; using FP32.[/yellow]")
        return "FP32"
    return req


# ---------------------------------------------------------
# Persistent Predictor & Model Manager
# ---------------------------------------------------------

class PotholePredictor:
    """Persistent, GPU-accelerated YOLO predictor for road anomaly detection.

    Separates one-time cold initialisation (CUDA context, model deserialisation,
    Conv+BN fusion, FP16 conversion, kernel & NMS warmup) from warm predictions,
    reusing the loaded model and predictor state across calls with zero reload.
    """

    def __init__(
        self,
        model_path: Path | str,
        device: str = "0",
        imgsz: int = 1280,
        conf: float = 0.20,
        iou: float = 0.70,
        max_det: int = 300,
        precision: str = "auto",
        batch_size: int = 1,
        tta: bool = False,
        warmup: bool = True,
    ) -> None:
        self.model_path = Path(model_path).resolve()
        self.device_str = resolve_device(device)
        self.imgsz = imgsz
        self.conf = conf
        self.iou = iou
        self.max_det = max_det
        self.batch_size = batch_size
        self.tta = tta

        self.is_cuda = self.device_str not in ("cpu", "mps") and torch.cuda.is_available()
        self.device_idx = int(self.device_str) if self.is_cuda else -1
        self.precision = resolve_precision(precision, self.is_cuda)
        self.quantize_val = 16 if (self.precision == "FP16" and self.is_cuda) else None

        self.cold_metrics = ColdStartMetrics(imports_ms=IMPORT_TIME_MS)

        # 1. Explicit CUDA Context Initialisation
        # Note: Do NOT enable torch.backends.cudnn.benchmark=True because rect=True
        # generates varying aspect ratios (e.g. 864x1280 vs 1280x1280 warmup), which
        # would trigger multi-second cuDNN algorithm autotuning stalls on new shapes.
        t_cuda_0 = time.perf_counter()
        if self.is_cuda:
            torch.cuda.init()
            torch.cuda.set_device(self.device_idx)
            _ = torch.zeros(1, device=f"cuda:{self.device_idx}")
            torch.cuda.synchronize(self.device_idx)
        self.cold_metrics.cuda_init_ms = (time.perf_counter() - t_cuda_0) * 1000.0

        # 2. Model File Loading & Deserialisation
        t_load_0 = time.perf_counter()
        self.model = YOLO(str(self.model_path))
        self.cold_metrics.model_load_ms = (time.perf_counter() - t_load_0) * 1000.0

        # 3. Predictor Setup, Layer Fusion, FP16 Conversion & GPU Transfer
        t_tx_0 = time.perf_counter()
        overrides = self._build_overrides(save=False, project=Path("predictions"), name="results")
        self.predictor = self.model._smart_load("predictor")(
            overrides=overrides,
            _callbacks=self.model.callbacks,
        )
        self.predictor.setup_model(model=self.model.model, verbose=False)
        self.model.predictor = self.predictor
        if self.is_cuda:
            torch.cuda.synchronize(self.device_idx)
        self.cold_metrics.model_transfer_ms = (time.perf_counter() - t_tx_0) * 1000.0

        # Stage timing hooks (single-pass measurement without duplicate disk reads)
        self._stage_state = {"load_ms": 0.0, "vis_save_ms": 0.0, "t_iter": 0.0, "t_post": 0.0}
        self._attach_timing_callbacks()

        # 4. Complete CUDA & FP16 NMS Kernel Warm-up
        if warmup:
            self.cold_metrics.warmup_ms = self._perform_warmup()

        self.cold_metrics.total_cold_ms = (
            self.cold_metrics.imports_ms
            + self.cold_metrics.cuda_init_ms
            + self.cold_metrics.model_load_ms
            + self.cold_metrics.model_transfer_ms
            + self.cold_metrics.warmup_ms
        )

    def _build_overrides(
        self,
        *,
        save: bool,
        project: Path,
        name: str,
        save_txt: bool = False,
        save_crop: bool = False,
        show_labels: bool = True,
        line_width: Optional[int] = None,
    ) -> dict[str, Any]:
        return {
            "conf": self.conf,
            "iou": self.iou,
            "imgsz": self.imgsz,
            "max_det": self.max_det,
            "device": self.device_str,
            "quantize": self.quantize_val,
            "augment": self.tta,
            "batch": self.batch_size,
            "save": save,
            "save_txt": save_txt,
            "save_crop": save_crop,
            "show_labels": show_labels,
            "line_width": line_width,
            "project": str(Path(project).resolve()),
            "name": name,
            "exist_ok": False,
            "stream_buffer": False,
            "mode": "predict",
            "rect": True,
            "verbose": False,
        }

    def _attach_timing_callbacks(self) -> None:
        state = self._stage_state

        def on_start(_pred: Any) -> None:
            state["load_ms"] = 0.0
            state["vis_save_ms"] = 0.0
            state["t_iter"] = time.perf_counter()

        def on_batch_start(_pred: Any) -> None:
            state["load_ms"] += (time.perf_counter() - state["t_iter"]) * 1000.0

        def on_post_end(_pred: Any) -> None:
            state["t_post"] = time.perf_counter()

        def on_batch_end(_pred: Any) -> None:
            state["vis_save_ms"] += (time.perf_counter() - state["t_post"]) * 1000.0

        self.predictor.add_callback("on_predict_start", on_start)
        self.predictor.add_callback("on_predict_batch_start", on_batch_start)
        self.predictor.add_callback("on_predict_postprocess_end", on_post_end)
        self.predictor.add_callback("on_predict_batch_end", on_batch_end)

    def _perform_warmup(self) -> float:
        """Warm up forward pass, rectangular letterbox shape, FP16 NMS, and box scaling."""
        t0 = time.perf_counter()
        dummy = np.zeros((min(800, self.imgsz), min(1200, self.imgsz), 3), dtype=np.uint8)
        _ = list(self.predictor(source=[dummy], stream=True))

        # AutoBackend.warmup() only warms up FP32 (1, 84, 16) with 0 detections.
        # Explicitly prime FP16 (1, 5, 22680) NMS + scale_boxes so the first real
        # positive detection does not suffer JIT kernel compilation lag.
        dev = f"cuda:{self.device_idx}" if self.is_cuda else self.device_str
        dtype = torch.float16 if (self.precision == "FP16" and self.is_cuda) else torch.float32
        synth = torch.zeros((1, 5, 22680), device=dev, dtype=dtype)
        synth[0, :, 0] = torch.tensor([100.0, 100.0, 50.0, 50.0, 0.90], device=dev, dtype=dtype)
        synth[0, :, 1] = torch.tensor([105.0, 105.0, 50.0, 50.0, 0.80], device=dev, dtype=dtype)
        kept = nms.non_max_suppression(synth, conf_thres=self.conf, iou_thres=self.iou, max_det=self.max_det)
        if kept and len(kept[0]):
            _ = ops.scale_boxes((864, self.imgsz), kept[0][:, :4], (800, 1200, 3))

        self.predictor.done_warmup = True
        if self.is_cuda:
            torch.cuda.synchronize(self.device_idx)
        return (time.perf_counter() - t0) * 1000.0

    def update_params(
        self,
        *,
        conf: float,
        iou: float,
        imgsz: int,
        max_det: int,
        batch_size: int,
        tta: bool,
    ) -> None:
        """Update mutable inference parameters without reloading weights or CUDA context."""
        self.conf = conf
        self.iou = iou
        self.imgsz = imgsz
        self.max_det = max_det
        self.batch_size = batch_size
        self.tta = tta

    def predict(
        self,
        source: Any,
        save: bool = True,
        save_txt: bool = False,
        save_crop: bool = False,
        show_labels: bool = True,
        line_width: Optional[int] = None,
        json_export: bool = False,
        csv_export: bool = False,
        project: Path = Path("predictions"),
        name: str = "results",
    ) -> tuple[list[dict], WarmPredictionMetrics, Optional[Path]]:
        """Execute prediction using the warm, resident model without reloading weights."""
        needs_disk_output = save or json_export or csv_export or save_txt or save_crop
        overrides = self._build_overrides(
            save=save,
            project=project,
            name=name,
            save_txt=save_txt,
            save_crop=save_crop,
            show_labels=show_labels,
            line_width=line_width,
        )
        base_args = {**DEFAULT_CFG_DICT, **self.model.overrides, **overrides}
        self.predictor.args = get_cfg(base_args)
        if needs_disk_output:
            self.predictor.save_dir = get_save_dir(self.predictor.args)

        records: list[dict] = []
        bbox_conv_ms = 0.0

        t_total_0 = time.perf_counter()
        stream = self.predictor(source=source, stream=True)
        for res in stream:
            t_ext_0 = time.perf_counter()
            records.append(extract(res))
            bbox_conv_ms += (time.perf_counter() - t_ext_0) * 1000.0
            self._stage_state["t_iter"] = time.perf_counter()

        if self.is_cuda:
            torch.cuda.synchronize(self.device_idx)

        # Export JSON/CSV metadata if requested
        t_meta_0 = time.perf_counter()
        actual_save_dir: Optional[Path] = None
        if needs_disk_output:
            actual_save_dir = Path(self.predictor.save_dir)
            if json_export or csv_export:
                actual_save_dir.mkdir(parents=True, exist_ok=True)
            if json_export:
                (actual_save_dir / "detections.json").write_text(
                    json.dumps(records, indent=2), encoding="utf-8"
                )
            if csv_export:
                write_csv(actual_save_dir / "detections.csv", records)
        meta_save_ms = (time.perf_counter() - t_meta_0) * 1000.0

        total_wall_ms = (time.perf_counter() - t_total_0) * 1000.0
        n_items = max(len(records), 1)

        image_load_ms = self._stage_state["load_ms"] / n_items
        preprocess_ms = sum(r["speed_ms"].get("preprocess", 0.0) for r in records) / n_items
        inference_ms = sum(r["speed_ms"].get("inference", 0.0) for r in records) / n_items
        postprocess_ms = sum(r["speed_ms"].get("postprocess", 0.0) for r in records) / n_items
        per_item_bbox_ms = bbox_conv_ms / n_items
        saving_ms = (self._stage_state["vis_save_ms"] + meta_save_ms) / n_items

        per_item_total = total_wall_ms / n_items
        gpu_pipeline_ms = preprocess_ms + inference_ms + postprocess_ms

        metrics = WarmPredictionMetrics(
            image_load_ms=round(image_load_ms, 2),
            preprocess_ms=round(preprocess_ms, 2),
            inference_ms=round(inference_ms, 2),
            postprocess_ms=round(postprocess_ms, 2),
            bbox_conversion_ms=round(per_item_bbox_ms, 2),
            saving_ms=round(saving_ms, 2),
            total_warm_ms=round(per_item_total, 2),
            gpu_pipeline_ms=round(gpu_pipeline_ms, 2),
            throughput_fps=round(1000.0 / per_item_total, 1) if per_item_total > 0 else 0.0,
            gpu_fps=round(1000.0 / gpu_pipeline_ms, 1) if gpu_pipeline_ms > 0 else 0.0,
        )

        return records, metrics, actual_save_dir

    def unload(self) -> None:
        """Release model weights and clear CUDA cache safely."""
        self.predictor = None
        self.model = None
        gc.collect()
        if self.is_cuda:
            torch.cuda.empty_cache()


class PersistentModelManager:
    """Singleton registry keeping the active PotholePredictor loaded across requests.

    Prevents repeated CUDA initialisation, model deserialisation, and warmup overhead
    across multiple prediction calls, while handling model/device switching safely.
    """

    _active_key: Optional[tuple[str, str, str]] = None
    _active_predictor: Optional[PotholePredictor] = None

    @classmethod
    def get_predictor(
        cls,
        model_path: Path | str,
        device: str = "0",
        imgsz: int = 1280,
        conf: float = 0.20,
        iou: float = 0.70,
        max_det: int = 300,
        precision: str = "auto",
        batch_size: int = 1,
        tta: bool = False,
        warmup: bool = True,
    ) -> tuple[PotholePredictor, bool]:
        """Return (predictor, is_cold_start), reusing the resident model when unchanged."""
        resolved_path = str(Path(model_path).resolve())
        resolved_dev = resolve_device(device)
        is_cuda = resolved_dev not in ("cpu", "mps") and torch.cuda.is_available()
        resolved_prec = resolve_precision(precision, is_cuda)
        key = (resolved_path, resolved_dev, resolved_prec)

        if cls._active_predictor is not None and cls._active_key == key:
            cls._active_predictor.update_params(
                conf=conf,
                iou=iou,
                imgsz=imgsz,
                max_det=max_det,
                batch_size=batch_size,
                tta=tta,
            )
            return cls._active_predictor, False

        if cls._active_predictor is not None:
            cls._active_predictor.unload()
            cls._active_predictor = None
            cls._active_key = None

        predictor = PotholePredictor(
            model_path=resolved_path,
            device=resolved_dev,
            imgsz=imgsz,
            conf=conf,
            iou=iou,
            max_det=max_det,
            precision=resolved_prec,
            batch_size=batch_size,
            tta=tta,
            warmup=warmup,
        )
        cls._active_predictor = predictor
        cls._active_key = key
        return predictor, True

    @classmethod
    def clear(cls) -> None:
        if cls._active_predictor is not None:
            cls._active_predictor.unload()
            cls._active_predictor = None
            cls._active_key = None


# ---------------------------------------------------------
# Extraction, Export & Summaries
# ---------------------------------------------------------

def extract(result: Any) -> dict[str, Any]:
    """Pull plain-Python detections out of an Ultralytics Results object."""
    h, w = result.orig_shape
    dets: list[dict[str, Any]] = []
    if result.boxes is not None and len(result.boxes):
        xyxy = result.boxes.xyxy.cpu().numpy()
        conf = result.boxes.conf.cpu().numpy()
        for (x1, y1, x2, y2), c in sorted(zip(xyxy, conf), key=lambda t: -t[1]):
            dets.append({
                "confidence": round(float(c), 4),
                "x1": round(float(x1), 1),
                "y1": round(float(y1), 1),
                "x2": round(float(x2), 1),
                "y2": round(float(y2), 1),
                "width": round(float(x2 - x1), 1),
                "height": round(float(y2 - y1), 1),
                "area_pct": round(float((x2 - x1) * (y2 - y1) / (w * h) * 100), 3),
            })
    return {
        "image": str(result.path),
        "width": int(w),
        "height": int(h),
        "count": len(dets),
        "detections": dets,
        "speed_ms": {k: round(float(v), 2) for k, v in (result.speed or {}).items()},
    }


def write_csv(path: Path, records: list[dict[str, Any]]) -> None:
    fields = ["image", "width", "height", "confidence", "x1", "y1", "x2", "y2", "box_width", "box_height", "area_pct"]
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(fields)
        for r in records:
            for d in r["detections"]:
                w.writerow([
                    r["image"], r["width"], r["height"], d["confidence"], d["x1"], d["y1"],
                    d["x2"], d["y2"], d["width"], d["height"], d["area_pct"],
                ])


def compute_summary(records: list[dict[str, Any]]) -> DetectionSummary:
    total = sum(r["count"] for r in records)
    with_det = sum(1 for r in records if r["count"] > 0)
    confs = [d["confidence"] for r in records for d in r["detections"]]
    return DetectionSummary(
        total_potholes=total,
        images_with_potholes=with_det,
        total_images=len(records),
        mean_confidence=float(sum(confs) / len(confs)) if confs else 0.0,
        highest_confidence=float(max(confs)) if confs else 0.0,
        lowest_confidence=float(min(confs)) if confs else 0.0,
    )


# ---------------------------------------------------------
# Terminal Reporting
# ---------------------------------------------------------

def show_detail(record: dict[str, Any]) -> None:
    name = Path(record["image"]).name
    if not record["detections"]:
        console.print(f"[dim]{name}: no potholes above the confidence threshold[/dim]")
        return
    table = Table(title=f"{name} — {record['count']} pothole(s)", box=box.ROUNDED, header_style="bold cyan")
    table.add_column("#", justify="right")
    table.add_column("Confidence", justify="right")
    table.add_column("Box (x1, y1, x2, y2)")
    table.add_column("Size (px)", justify="right")
    table.add_column("Image area", justify="right")
    for i, d in enumerate(record["detections"], 1):
        table.add_row(
            str(i), f"{d['confidence']:.1%}",
            f"({d['x1']:.0f}, {d['y1']:.0f}, {d['x2']:.0f}, {d['y2']:.0f})",
            f"{d['width']:.0f} × {d['height']:.0f}", f"{d['area_pct']:.2f}%",
        )
    console.print(table)


def show_summary(records: list[dict[str, Any]]) -> None:
    table = Table(title="Per-image summary", box=box.ROUNDED, header_style="bold cyan")
    table.add_column("Image")
    table.add_column("Potholes", justify="right")
    table.add_column("Top confidence", justify="right")
    shown = sorted(records, key=lambda r: -r["count"])[:MAX_SUMMARY_ROWS]
    for r in shown:
        top = f"{r['detections'][0]['confidence']:.1%}" if r["detections"] else "—"
        table.add_row(Path(r["image"]).name, str(r["count"]), top)
    console.print(table)
    if len(records) > len(shown):
        console.print(
            f"[dim]Showing the {len(shown)} images with the most detections. "
            "Use --csv or --json for everything.[/dim]"
        )


def print_performance_report(
    cold: ColdStartMetrics,
    warm: WarmPredictionMetrics,
    hw: HardwareMetrics,
    summary: DetectionSummary,
    model_path: Path,
    save_dir: Optional[Path] = None,
    reused_model: bool = False,
) -> None:
    """Print separated Cold-Start vs. Warm-Prediction lifecycle report."""
    gpu_label = f"{hw.device_name} (CUDA {hw.cuda_version})" if hw.is_cuda else "CPU"
    mem_label = (
        f"{hw.gpu_mem_allocated_mb:.1f} MB alloc · {hw.gpu_mem_peak_mb:.1f} MB peak / {hw.gpu_mem_total_gb:.1f} GB"
        if hw.is_cuda
        else "N/A"
    )
    util_parts = []
    if hw.gpu_utilization_pct is not None:
        util_parts.append(f"GPU {hw.gpu_utilization_pct}%")
    if hw.cpu_utilization_pct is not None:
        util_parts.append(f"CPU {hw.cpu_utilization_pct:.0f}%")
    util_label = f" ({', '.join(util_parts)})" if util_parts else ""

    cold_status = "[dim](persistent — skipped on reuse)[/dim]" if reused_model else ""
    inf_label = "Inference (Pure GPU):" if hw.is_cuda else "Inference (CPU):     "
    pipe_label = "GPU pipeline (in-mem):" if hw.is_cuda else "CPU pipeline (in-mem):"

    lines = [
        f"[bold cyan]CONFIGURATION[/bold cyan]",
        f"  GPU / Device:          [bold]{gpu_label}[/bold]",
        f"  Model:                 [bold]{model_path.name}[/bold] ({model_path})",
        f"  Precision:             [bold]{hw.precision}[/bold] · Resolution: [bold]{hw.resolution}[/bold]",
        f"  Memory & Util:         {mem_label}{util_label}",
        "",
        f"[bold yellow]COLD START[/bold yellow] {cold_status}",
        f"  Imports & runtime:     {cold.imports_ms:>7.1f} ms",
        f"  CUDA initialisation:   {cold.cuda_init_ms:>7.1f} ms",
        f"  Model loading:         {cold.model_load_ms:>7.1f} ms",
        f"  GPU transfer & fusion: {cold.model_transfer_ms:>7.1f} ms",
        f"  Warm-up (model + NMS): {cold.warmup_ms:>7.1f} ms",
        f"  [bold]Total initialisation:  {cold.total_cold_ms:>7.1f} ms[/bold]",
        "",
        f"[bold green]WARM PREDICTION (STEADY-STATE)[/bold green]",
        f"  Image loading:         {warm.image_load_ms:>7.2f} ms",
        f"  Preprocessing:         {warm.preprocess_ms:>7.2f} ms",
        f"  {inf_label} {warm.inference_ms:>7.2f} ms",
        f"  Postprocessing (NMS):  {warm.postprocess_ms:>7.2f} ms",
        f"  BBox conversion:       {warm.bbox_conversion_ms:>7.2f} ms",
        f"  Saving results:        {warm.saving_ms:>7.2f} ms",
        f"  [bold]Total per-image:       {warm.total_warm_ms:>7.2f} ms[/bold] ([bold green]{warm.throughput_fps:.1f} FPS[/bold green])",
        f"  {pipe_label} {warm.gpu_pipeline_ms:>7.2f} ms ([bold cyan]{warm.gpu_fps:.1f} FPS[/bold cyan])",
        "",
        f"[bold magenta]DETECTION[/bold magenta]",
        f"  Potholes detected:     [bold]{summary.total_potholes}[/bold] across {summary.total_images} image(s) ({summary.images_with_potholes} with potholes)",
        f"  Mean confidence:       {summary.mean_confidence:.1%}",
        f"  Highest confidence:    {summary.highest_confidence:.1%}",
    ]
    if save_dir is not None:
        lines.append(f"\n[dim]Output saved in: {save_dir.resolve()}[/dim]")

    console.print(
        Panel(
            "\n".join(lines),
            title="[bold cyan]SIRI POTHOLE DETECTOR — LIFECYCLE REPORT[/bold cyan]",
            border_style="cyan",
            box=box.ROUNDED,
            expand=False,
        )
    )


# ---------------------------------------------------------
# Comprehensive Benchmark Suite
# ---------------------------------------------------------

def run_benchmark_suite(
    model_path: Path,
    source_image: str = "assets/reference.jpg",
    device: str = "0",
    imgsz: int = 1280,
    conf: float = 0.20,
    iou: float = 0.70,
    precision: str = "auto",
) -> None:
    """Measure Cold Start, Warm 1-image (save & no-save), In-memory stream, 10x, and 100x runs."""
    validate_source(source_image)
    console.print()
    console.print(
        Panel(
            "[bold cyan]SIRI BENCHMARK SUITE[/bold cyan]\n"
            "[dim]Measured Cold-Start vs. Warm-Prediction Lifecycle & Multi-Image Throughput[/dim]",
            border_style="cyan",
            box=box.ROUNDED,
            expand=False,
        )
    )

    # Clear any prior persistent model so Cold Start is genuinely cold (excl. Python imports already loaded)
    PersistentModelManager.clear()
    if torch.cuda.is_available():
        torch.cuda.reset_peak_memory_stats()

    # 1. Cold Start + First Image Prediction
    t_cold_and_first_0 = time.perf_counter()
    predictor, _ = PersistentModelManager.get_predictor(
        model_path=model_path,
        device=device,
        imgsz=imgsz,
        conf=conf,
        iou=iou,
        precision=precision,
        batch_size=1,
        warmup=True,
    )
    recs_first, warm_first, _ = predictor.predict(source=source_image, save=False)
    cold_plus_first_ms = (time.perf_counter() - t_cold_and_first_0) * 1000.0
    cold = predictor.cold_metrics

    # 2. Warm Single Image (Disk Read, No Disk Write)
    recs_warm_nosave, warm_nosave, _ = predictor.predict(source=source_image, save=False)

    # 3. Warm Single Image (Disk Read + Annotated JPG Write)
    _, warm_save, save_dir = predictor.predict(
        source=source_image, save=True, project=Path("predictions"), name="benchmark_tmp"
    )

    # 4. Warm In-Memory Frame (Zero Disk Read/Write — Simulating Live Video/Camera Frame)
    frame = cv2.imread(str(source_image))
    _, warm_inmem, _ = predictor.predict(source=[frame], save=False)

    # 5. Ten Consecutive Warm Images (Sequential calls through PersistentModelManager)
    times_10: list[float] = []
    inf_10: list[float] = []
    for _ in range(10):
        p_reused, is_cold = PersistentModelManager.get_predictor(
            model_path=model_path, device=device, imgsz=imgsz, conf=conf, iou=iou, precision=precision
        )
        assert not is_cold, "PersistentModelManager unexpectedly reloaded model"
        t0 = time.perf_counter()
        _, m = p_reused.predict(source=source_image, save=False)[:2]
        times_10.append((time.perf_counter() - t0) * 1000.0)
        inf_10.append(m.inference_ms)
    mean_10_ms = sum(times_10) / len(times_10)
    fps_10 = 1000.0 / mean_10_ms

    # 6. One Hundred Consecutive Frames (In-memory Continuous Stream, batch=1 & batch=4)
    console.print("[dim]Benchmarking 100 consecutive frames (batch=1 & batch=4)...[/dim]")
    t0_100_b1 = time.perf_counter()
    _, warm_100_b1, _ = predictor.predict(source=[frame] * 100, save=False)
    wall_100_b1_ms = (time.perf_counter() - t0_100_b1) * 1000.0

    predictor.update_params(conf=conf, iou=iou, imgsz=imgsz, max_det=300, batch_size=4, tta=False)
    t0_100_b4 = time.perf_counter()
    _, warm_100_b4, _ = predictor.predict(source=[frame] * 100, save=False)
    wall_100_b4_ms = (time.perf_counter() - t0_100_b4) * 1000.0
    predictor.update_params(conf=conf, iou=iou, imgsz=imgsz, max_det=300, batch_size=1, tta=False)

    # 7. Resolution & Accuracy Check (640 vs 960 vs 1280)
    res_rows: list[tuple[int, float, float, int, float]] = []
    for sz in (640, 960, 1280):
        predictor.update_params(conf=conf, iou=iou, imgsz=sz, max_det=300, batch_size=1, tta=False)
        _ = predictor.predict(source=[frame], save=False)  # prime shape
        r_sz, m_sz, _ = predictor.predict(source=[frame], save=False)
        s_sz = compute_summary(r_sz)
        res_rows.append((sz, m_sz.inference_ms, m_sz.total_warm_ms, s_sz.total_potholes, s_sz.mean_confidence))
    predictor.update_params(conf=conf, iou=iou, imgsz=imgsz, max_det=300, batch_size=1, tta=False)

    hw = query_hardware_metrics(predictor.device_idx, predictor.precision, predictor.imgsz)
    summary = compute_summary(recs_warm_nosave)

    # Clean up temporary benchmark image directory
    if save_dir is not None and save_dir.exists():
        import shutil
        shutil.rmtree(save_dir, ignore_errors=True)

    # Render Summary Table
    table = Table(title="Measured Benchmark Results", box=box.ROUNDED, header_style="bold cyan")
    table.add_column("Scenario", style="bold")
    table.add_column("Wall / Image", justify="right")
    table.add_column("Throughput", justify="right")
    table.add_column("Breakdown / Notes")

    table.add_row(
        "1 Image — Cold Start (Full)",
        f"{cold.total_cold_ms + warm_first.total_warm_ms:.1f} ms",
        "—",
        f"Imports: {cold.imports_ms:.0f}ms | CUDA: {cold.cuda_init_ms:.0f}ms | Load: {cold.model_load_ms:.0f}ms | Tx+Fuse: {cold.model_transfer_ms:.0f}ms | Warmup: {cold.warmup_ms:.0f}ms",
    )
    table.add_row(
        "1 Image — Cold (excl. Python imports)",
        f"{cold_plus_first_ms:.1f} ms",
        "—",
        f"CUDA+Load+Tx+Warmup: {cold.total_cold_ms - cold.imports_ms:.0f}ms + First predict: {warm_first.total_warm_ms:.1f}ms",
    )
    table.add_row(
        "1 Image — Warm (Disk, --no-save)",
        f"{warm_nosave.total_warm_ms:.2f} ms",
        f"{warm_nosave.throughput_fps:.1f} FPS",
        f"Read: {warm_nosave.image_load_ms:.1f}ms | Pre: {warm_nosave.preprocess_ms:.1f}ms | Inf: {warm_nosave.inference_ms:.1f}ms | NMS: {warm_nosave.postprocess_ms:.1f}ms",
    )
    table.add_row(
        "1 Image — Warm (Disk + Save JPG)",
        f"{warm_save.total_warm_ms:.2f} ms",
        f"{warm_save.throughput_fps:.1f} FPS",
        f"Read: {warm_save.image_load_ms:.1f}ms | GPU: {warm_save.gpu_pipeline_ms:.1f}ms | Annotate+Write: {warm_save.saving_ms:.1f}ms",
    )
    table.add_row(
        "1 Frame — Warm (In-Memory)",
        f"{warm_inmem.total_warm_ms:.2f} ms",
        f"{warm_inmem.throughput_fps:.1f} FPS",
        f"Pre: {warm_inmem.preprocess_ms:.1f}ms | Inf: {warm_inmem.inference_ms:.1f}ms | NMS: {warm_inmem.postprocess_ms:.1f}ms",
    )
    table.add_row(
        "10 Consecutive Images (Disk, Warm)",
        f"{mean_10_ms:.2f} ms",
        f"{fps_10:.1f} FPS",
        f"Inf avg: {sum(inf_10)/10:.2f}ms | Min: {min(times_10):.1f}ms | Max: {max(times_10):.1f}ms (0 model reloads)",
    )
    table.add_row(
        "100 Frames Stream (In-Mem, batch=1)",
        f"{wall_100_b1_ms / 100.0:.2f} ms",
        f"{100000.0 / wall_100_b1_ms:.1f} FPS",
        f"Total 100 frames: {wall_100_b1_ms / 1000.0:.2f}s | Inf: {warm_100_b1.inference_ms:.2f}ms/img",
    )
    table.add_row(
        "100 Frames Stream (In-Mem, batch=4)",
        f"{wall_100_b4_ms / 100.0:.2f} ms",
        f"{100000.0 / wall_100_b4_ms:.1f} FPS",
        f"Total 100 frames: {wall_100_b4_ms / 1000.0:.2f}s | Inf: {warm_100_b4.inference_ms:.2f}ms/img | Peak VRAM: {hw.gpu_mem_peak_mb:.0f}MB",
    )
    console.print(table)

    res_table = Table(title="Resolution vs. Accuracy & Speed Sensitivity (assets/reference.jpg)", box=box.ROUNDED, header_style="bold cyan")
    res_table.add_column("Resolution")
    res_table.add_column("GPU Inference", justify="right")
    res_table.add_column("Total Frame", justify="right")
    res_table.add_column("Potholes Found", justify="right")
    res_table.add_column("Mean Confidence", justify="right")
    for sz, inf_ms, tot_ms, cnt, mc in res_rows:
        res_table.add_row(f"{sz}×{sz}", f"{inf_ms:.2f} ms", f"{tot_ms:.2f} ms", str(cnt), f"{mc:.1%}")
    console.print(res_table)

    print_performance_report(cold, warm_nosave, hw, summary, model_path)


# ---------------------------------------------------------
# Interactive REPL & Directory Watch Modes
# ---------------------------------------------------------

def run_interactive_mode(predictor: PotholePredictor, default_source: str) -> None:
    """Keep model resident in GPU VRAM and predict interactively with zero reload latency."""
    console.print()
    console.print(
        Panel(
            "[bold cyan]SIRI INTERACTIVE PREDICTION REPL[/bold cyan]\n"
            "[dim]Model is loaded and warm in GPU VRAM. Predictions execute with 0 ms startup overhead.[/dim]\n"
            "Enter image/video path or glob, [bold]'b'[/bold] for benchmark, or [bold]'q'[/bold] to quit.",
            border_style="cyan",
            box=box.ROUNDED,
            expand=False,
        )
    )

    hw = query_hardware_metrics(predictor.device_idx, predictor.precision, predictor.imgsz)
    console.print(f"[green]✓[/green] Resident on {hw.device_name} ({hw.precision}) · Peak VRAM: {hw.gpu_mem_peak_mb:.1f} MB")

    while True:
        try:
            line = input("\nsiri-dl > ").strip()
        except (KeyboardInterrupt, EOFError):
            break

        if not line:
            line = default_source
        if line.lower() in ("q", "quit", "exit"):
            break
        if line.lower() in ("b", "bench", "benchmark"):
            run_benchmark_suite(
                predictor.model_path, default_source, predictor.device_str,
                predictor.imgsz, predictor.conf, predictor.iou, predictor.precision,
            )
            continue

        try:
            validate_source(line)
        except Exception as exc:
            console.print(f"[red]{exc}[/red]")
            continue

        records, warm, save_dir = predictor.predict(source=line, save=True, json_export=True, csv_export=True)
        summary = compute_summary(records)
        hw = query_hardware_metrics(predictor.device_idx, predictor.precision, predictor.imgsz)

        if len(records) <= MAX_DETAIL_IMAGES:
            for r in records:
                show_detail(r)
        else:
            show_summary(records)

        print_performance_report(
            predictor.cold_metrics, warm, hw, summary, predictor.model_path, save_dir, reused_model=True
        )


def run_watch_mode(predictor: PotholePredictor, watch_dir: Path) -> None:
    """Watch a directory and run predictions on newly added images using the warm model."""
    console.print()
    console.print(
        Panel(
            f"[bold cyan]SIRI DIRECTORY WATCHER[/bold cyan]\n"
            f"Monitoring [bold]{watch_dir.resolve()}[/bold] for new frames...\n"
            "[dim]Model stays resident in GPU memory. Press Ctrl+C to stop.[/dim]",
            border_style="cyan",
            box=box.ROUNDED,
            expand=False,
        )
    )

    watch_dir.mkdir(parents=True, exist_ok=True)
    processed = set(watch_dir.glob("*.*"))

    try:
        while True:
            current = set(watch_dir.glob("*.*"))
            new_files = [f for f in current - processed if f.suffix.lower() in IMAGE_EXTENSIONS]
            for f in sorted(new_files):
                console.print(f"\n[cyan]Detected new frame:[/cyan] {f.name}")
                records, warm, save_dir = predictor.predict(source=str(f), save=True, json_export=True)
                summary = compute_summary(records)
                hw = query_hardware_metrics(predictor.device_idx, predictor.precision, predictor.imgsz)
                print_performance_report(
                    predictor.cold_metrics, warm, hw, summary, predictor.model_path, save_dir, reused_model=True
                )
                processed.add(f)
            time.sleep(0.25)
    except KeyboardInterrupt:
        console.print("\n[yellow]Watcher stopped.[/yellow]")


# ---------------------------------------------------------
# CLI
# ---------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    default_src = "assets/reference.jpg" if Path("assets/reference.jpg").is_file() else "reference.jpg"
    p.add_argument("source", nargs="?", default=default_src,
                   help="Image, folder, glob, video, URL, or webcam index (default: assets/reference.jpg)")
    p.add_argument("--model", type=Path, default=None,
                   help="Path to weights (default: newest runs/**/weights/best.pt)")
    p.add_argument("--conf", type=float, default=0.20, help="Confidence threshold (default: 0.20)")
    p.add_argument("--iou", type=float, default=0.70, help="NMS IoU threshold (default: 0.70)")
    p.add_argument("--imgsz", type=int, default=1280,
                   help="Inference size. Best accuracy for small/distant potholes is 1280 (default: 1280)")
    p.add_argument("--max-det", type=int, default=300, help="Maximum detections per image (default: 300)")
    p.add_argument("--device", default="0", help="CUDA index, 'cpu', or 'mps' (default: '0')")
    p.add_argument("--batch-size", type=int, default=1, help="Batch size for multi-image prediction (default: 1)")

    # Precision configuration (quantize=16 replaces deprecated half=True)
    p.add_argument("--precision", choices=["fp16", "fp32", "auto"], default="auto",
                   help="Inference precision (default: auto -> FP16 on CUDA, FP32 on CPU)")
    p.add_argument("--fp16", dest="precision", action="store_const", const="fp16", help="Force FP16 half precision")
    p.add_argument("--fp32", dest="precision", action="store_const", const="fp32", help="Force FP32 single precision")
    p.add_argument("--no-half", dest="precision", action="store_const", const="fp32",
                   help="Deprecated: use --fp32 or --precision fp32")
    p.add_argument("--half", dest="precision", action="store_const", const="fp16",
                   help="Deprecated: use --fp16 or --precision fp16")

    p.add_argument("--tta", action="store_true", help="Test-time augmentation (slower, often finds more)")
    p.add_argument("--project", type=Path, default=Path("predictions"))
    p.add_argument("--name", default="results")
    p.add_argument("--no-save", dest="save", action="store_false", help="Don't write annotated images/videos")
    p.add_argument("--hide-labels", action="store_true")
    p.add_argument("--line-width", type=int, default=None)
    p.add_argument("--save-txt", action="store_true", help="Save YOLO-format label files")
    p.add_argument("--save-crops", action="store_true", help="Save a crop of every detection")
    p.add_argument("--json", action="store_true", help="Write detections.json")
    p.add_argument("--csv", action="store_true", help="Write detections.csv")

    # Persistent Lifecycle & Benchmark Modes
    p.add_argument("-i", "--interactive", action="store_true",
                   help="Keep model loaded in GPU VRAM and run interactive prediction REPL")
    p.add_argument("--benchmark", action="store_true",
                   help="Run full Cold-Start vs. Warm-Prediction benchmark suite")
    p.add_argument("--watch", type=Path, default=None,
                   help="Watch directory for incoming frames with zero model reload overhead")
    return p.parse_args()


# ---------------------------------------------------------
# Main
# ---------------------------------------------------------

def main() -> None:
    args = parse_args()
    model_path = resolve_model(args.model)

    if args.benchmark:
        run_benchmark_suite(
            model_path=model_path,
            source_image=args.source,
            device=args.device,
            imgsz=args.imgsz,
            conf=args.conf,
            iou=args.iou,
            precision=args.precision,
        )
        return

    predictor, is_cold = PersistentModelManager.get_predictor(
        model_path=model_path,
        device=args.device,
        imgsz=args.imgsz,
        conf=args.conf,
        iou=args.iou,
        max_det=args.max_det,
        precision=args.precision,
        batch_size=args.batch_size,
        tta=args.tta,
        warmup=True,
    )

    if args.interactive:
        run_interactive_mode(predictor, default_source=args.source)
        return

    if args.watch is not None:
        run_watch_mode(predictor, watch_dir=args.watch)
        return

    validate_source(args.source)
    source = int(args.source) if args.source.isdigit() else args.source

    console.print()
    console.print(
        Panel(
            "[bold cyan]POTHOLE DETECTION[/bold cyan]\n"
            "[dim]High-Performance CUDA Inference with Lifecycle Telemetry[/dim]",
            border_style="cyan",
            box=box.ROUNDED,
            expand=False,
        )
    )

    records, warm, save_dir = predictor.predict(
        source=source,
        save=args.save,
        save_txt=args.save_txt,
        save_crop=args.save_crops,
        show_labels=not args.hide_labels,
        line_width=args.line_width,
        json_export=args.json,
        csv_export=args.csv,
        project=args.project,
        name=args.name,
    )

    if not records:
        console.print("[yellow]No images were processed. Check the source path or glob.[/yellow]")
        return

    summary = compute_summary(records)
    hw = query_hardware_metrics(predictor.device_idx, predictor.precision, predictor.imgsz)

    console.print()
    if len(records) <= MAX_DETAIL_IMAGES:
        for r in records:
            show_detail(r)
    else:
        show_summary(records)

    print_performance_report(
        predictor.cold_metrics,
        warm,
        hw,
        summary,
        model_path,
        save_dir=save_dir,
        reused_model=not is_cold,
    )

    if summary.total_potholes == 0:
        console.print(f"[dim]Nothing found at conf={args.conf}. Try a lower --conf or --tta.[/dim]")
    elif summary.total_potholes > 0:
        confs = [d["confidence"] for r in records for d in r["detections"]]
        if confs and sum(c < 0.35 for c in confs) / len(confs) > 0.5:
            console.print("[dim]Most detections are low-confidence; verify them visually before trusting the count.[/dim]")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        console.print("\n[yellow]Cancelled by user.[/yellow]")
        raise SystemExit(130)
    except Exception as exc:
        console.print(f"\n[bold red]ERROR:[/bold red] {exc}")
        raise
