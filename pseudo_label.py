from __future__ import annotations

import argparse
import concurrent.futures
import json
import shutil
import time
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from statistics import mean
from typing import Any, Iterable

from PIL import Image
from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.progress import (
    BarColumn,
    MofNCompleteColumn,
    Progress,
    SpinnerColumn,
    TextColumn,
    TimeElapsedColumn,
    TimeRemainingColumn,
)
from rich.table import Table
from ultralytics import YOLO
from ultralytics.engine.results import Results

# ---------------------------------------------------------
# Default Configuration Constants
# ---------------------------------------------------------

DEFAULT_SOURCE = Path("dataset")
DEFAULT_MODEL_PATH = Path("runs/detect/runs/pothole/baseline/weights/best.pt")
DEFAULT_OUTPUT = Path("pseudo_dataset")

DEFAULT_CONFIDENCE = 0.75
DEFAULT_IMAGE_SIZE = 640
DEFAULT_DEVICE = "0"  # "0" for NVIDIA GPU, "cpu" for CPU, "mps" for Apple Silicon
DEFAULT_BATCH_SIZE = 32
DEFAULT_IO_WORKERS = 8

DEFAULT_TRAIN_GROUPS = [
    "ds1_simplex-train",
    "ds2_complex-train",
]

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
TARGET_CLASS_NAME = "pothole"
MIN_BOX_AREA = 0.0001  # Minimum normalized area (w * h) to reject degenerate boxes

console = Console()


# ---------------------------------------------------------
# Data Structures
# ---------------------------------------------------------

@dataclass
class DetectionBox:
    class_id: int
    x: float
    y: float
    w: float
    h: float
    confidence: float


@dataclass
class GroupStats:
    images_scanned: int = 0
    candidates: int = 0
    already_annotated: int = 0
    missing_annotations: int = 0
    invalid_annotations: int = 0
    accepted: int = 0
    rejected: int = 0
    errors: int = 0
    detections: int = 0


# ---------------------------------------------------------
# Terminal UI Helpers
# ---------------------------------------------------------

def show_banner(config: argparse.Namespace) -> None:
    console.print()
    console.print(
        Panel(
            "[bold cyan]ROAD POTHOLE DETECTION[/bold cyan]\n"
            "[white]High-Throughput Pseudo-Label Pipeline[/white]\n"
            "[dim]Mining high-confidence detections with batched GPU acceleration[/dim]",
            border_style="cyan",
            box=box.ROUNDED,
            expand=False,
        )
    )

    console.print(f"[dim]Dataset:    {config.source.resolve()}[/dim]")
    console.print(f"[dim]Model:      {config.model.resolve()}[/dim]")
    console.print(f"[dim]Output:     {config.output.resolve()}[/dim]")
    console.print(
        f"[dim]Confidence: {config.conf:.0%} | "
        f"Batch Size: {config.batch_size} | "
        f"Img Size: {config.imgsz} | "
        f"Device: {config.device}[/dim]"
    )
    console.print()


def make_progress() -> Progress:
    return Progress(
        SpinnerColumn(style="cyan"),
        TextColumn("[bold]{task.description}"),
        BarColumn(bar_width=30, complete_style="green"),
        MofNCompleteColumn(),
        TextColumn("[cyan]{task.percentage:>3.0f}%"),
        TextColumn("•"),
        TimeElapsedColumn(),
        TextColumn("elapsed"),
        TextColumn("•"),
        TimeRemainingColumn(),
        console=console,
        transient=False,
    )


def show_stats_table(title: str, stats: dict[str, Any]) -> None:
    table = Table(
        title=title,
        box=box.ROUNDED,
        header_style="bold cyan",
    )
    table.add_column("Metric")
    table.add_column("Value", justify="right")

    for name, value in stats.items():
        if isinstance(value, int):
            rendered = f"{value:,}"
        elif isinstance(value, float):
            rendered = f"{value:,.2f}"
        else:
            rendered = str(value)
        table.add_row(name, rendered)

    console.print(table)


# ---------------------------------------------------------
# Dataset Inspection (Multithreaded)
# ---------------------------------------------------------

def inspect_single_annotation(
    image_path: Path, ann_dir: Path
) -> tuple[Path, str]:
    """Inspect Supervisely JSON annotation format for pothole presence."""
    ann_path = ann_dir / f"{image_path.name}.json"

    if not ann_path.is_file():
        return image_path, "missing"

    try:
        data = json.loads(ann_path.read_text(encoding="utf-8"))
        has_pothole = any(
            obj.get("classTitle", "").strip().lower() == TARGET_CLASS_NAME
            and obj.get("geometryType") == "rectangle"
            for obj in data.get("objects", [])
        )
        return image_path, ("annotated" if has_pothole else "candidate")
    except Exception:
        return image_path, "invalid"


def collect_candidates(
    config: argparse.Namespace,
) -> tuple[list[tuple[str, Path]], dict[str, GroupStats]]:
    candidates: list[tuple[str, Path]] = []
    group_stats: dict[str, GroupStats] = {}

    console.rule("[bold cyan]Scanning Dataset[/bold cyan]")

    for group in config.groups:
        image_dir = config.source / group / "img"
        ann_dir = config.source / group / "ann"

        if not image_dir.is_dir() or not ann_dir.is_dir():
            raise FileNotFoundError(
                f"Missing required subfolders for group '{group}':\n"
                f"  Images:      {image_dir.resolve()}\n"
                f"  Annotations: {ann_dir.resolve()}"
            )

        images = sorted(
            p for p in image_dir.rglob("*")
            if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
        )

        stats = GroupStats(images_scanned=len(images))

        with make_progress() as progress:
            task = progress.add_task(f"[cyan]Scanning {group}", total=len(images))

            with concurrent.futures.ThreadPoolExecutor(
                max_workers=config.io_workers
            ) as executor:
                futures = {
                    executor.submit(inspect_single_annotation, img, ann_dir): img
                    for img in images
                }

                for future in concurrent.futures.as_completed(futures):
                    img_path, status = future.result()
                    if status == "missing":
                        stats.missing_annotations += 1
                    elif status == "invalid":
                        stats.invalid_annotations += 1
                    elif status == "annotated":
                        stats.already_annotated += 1
                    elif status == "candidate":
                        stats.candidates += 1
                        candidates.append((group, img_path))

                    progress.advance(task)

        group_stats[group] = stats
        show_stats_table(
            f"Scan Summary: {group}",
            {
                "Images Scanned": stats.images_scanned,
                "Candidate Images": stats.candidates,
                "Already Annotated": stats.already_annotated,
                "Missing Annotations": stats.missing_annotations,
                "Corrupt/Invalid JSON": stats.invalid_annotations,
            },
        )

    console.print(f"\n[bold]Total Candidate Images Identified:[/bold] {len(candidates):,}\n")
    return candidates, group_stats


# ---------------------------------------------------------
# Disk Output & YAML Generation
# ---------------------------------------------------------

def prepare_output(output_dir: Path, clean: bool) -> tuple[Path, Path]:
    images_out = output_dir / "images"
    labels_out = output_dir / "labels"

    if clean:
        for directory in (images_out, labels_out):
            if directory.exists():
                shutil.rmtree(directory)

    images_out.mkdir(parents=True, exist_ok=True)
    labels_out.mkdir(parents=True, exist_ok=True)
    return images_out, labels_out


def write_dataset_yaml(output_dir: Path, class_id: int) -> Path:
    yaml_path = output_dir / "dataset.yaml"
    content = (
        f"# Auto-generated Ultralytics YOLO dataset configuration\n"
        f"path: {output_dir.resolve().as_posix()}\n"
        f"train: images\n"
        f"val: images  # Modify with an explicit validation split if desired\n\n"
        f"names:\n"
        f"  {class_id}: {TARGET_CLASS_NAME}\n"
    )
    yaml_path.write_text(content, encoding="utf-8")
    return yaml_path


def export_sample(
    src_image: Path,
    dst_image: Path,
    dst_label: Path,
    boxes: list[DetectionBox],
) -> None:
    """Save normalized JPEG and YOLO txt labels."""
    with Image.open(src_image) as im:
        im.convert("RGB").save(dst_image, format="JPEG", quality=95)

    with dst_label.open("w", encoding="utf-8") as f:
        for b in boxes:
            f.write(
                f"{b.class_id} {b.x:.6f} {b.y:.6f} {b.w:.6f} {b.h:.6f}\n"
            )


# ---------------------------------------------------------
# Inference & Box Processing
# ---------------------------------------------------------

def resolve_target_class_id(model: YOLO, target_name: str) -> int:
    """Identify the target class index from the YOLO model metadata."""
    names = getattr(model, "names", {})
    if isinstance(names, dict):
        for cid, cname in names.items():
            if str(cname).strip().lower() == target_name.lower():
                return int(cid)
    elif isinstance(names, (list, tuple)):
        for cid, cname in enumerate(names):
            if str(cname).strip().lower() == target_name.lower():
                return int(cid)

    console.print(
        f"[yellow]Notice:[/yellow] Class '{target_name}' not found in model names ({names}). "
        f"Defaulting to class ID 0."
    )
    return 0


def filter_valid_boxes(
    boxes: Any, target_class_id: int, conf_thresh: float
) -> list[DetectionBox]:
    if boxes is None or len(boxes) == 0:
        return []

    valid_boxes: list[DetectionBox] = []
    for detection in boxes:
        cid = int(detection.cls[0])
        conf = float(detection.conf[0])

        if cid != target_class_id or conf < conf_thresh:
            continue

        x, y, w, h = detection.xywhn[0].tolist()

        # Sanity filtering: reject invalid coordinates and tiny noise boxes
        if w * h < MIN_BOX_AREA:
            continue

        # Clamp normalized coordinates safely inside [0.0, 1.0]
        x_clamped = max(0.0, min(1.0, x))
        y_clamped = max(0.0, min(1.0, y))
        w_clamped = max(0.0, min(1.0, w))
        h_clamped = max(0.0, min(1.0, h))

        valid_boxes.append(
            DetectionBox(
                class_id=0,  # Exported dataset maps target class to 0
                x=x_clamped,
                y=y_clamped,
                w=w_clamped,
                h=h_clamped,
                confidence=conf,
            )
        )

    return valid_boxes


def chunk_list(data: list[Any], chunk_size: int) -> Iterable[list[Any]]:
    for i in range(0, len(data), chunk_size):
        yield data[i : i + chunk_size]


def predict_batch_with_fallback(
    model: YOLO,
    batch_paths: list[Path],
    config: argparse.Namespace,
) -> list[Results | None]:
    """Execute batch inference with per-sample fallback on failure."""
    try:
        predictions = model.predict(
            source=[str(p) for p in batch_paths],
            imgsz=config.imgsz,
            conf=config.conf,
            device=config.device,
            batch=len(batch_paths),
            verbose=False,
            stream=False,
        )
        return [prediction if isinstance(prediction, Results) else None for prediction in predictions]
    except Exception:
        # Fallback to single-sample inference if the batch contains a corrupted file
        fallback_results: list[Results | None] = []
        for path in batch_paths:
            try:
                pred = model.predict(
                    source=str(path),
                    imgsz=config.imgsz,
                    conf=config.conf,
                    device=config.device,
                    verbose=False,
                    stream=False,
                )
                first_prediction = next(iter(pred), None)
                fallback_results.append(
                    first_prediction if isinstance(first_prediction, Results) else None
                )
            except Exception:
                fallback_results.append(None)
        return fallback_results


# ---------------------------------------------------------
# Main Execution Pipeline
# ---------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate YOLO pseudo-labels from unlabeled dataset partitions."
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE,
        help="Root folder of the raw dataset.",
    )
    parser.add_argument(
        "--model",
        type=Path,
        default=DEFAULT_MODEL_PATH,
        help="Path to trained YOLO weights file (.pt).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Destination directory for pseudo-labeled dataset.",
    )
    parser.add_argument(
        "--conf",
        type=float,
        default=DEFAULT_CONFIDENCE,
        help="Confidence threshold for pseudo-label acceptance.",
    )
    parser.add_argument(
        "--imgsz",
        type=int,
        default=DEFAULT_IMAGE_SIZE,
        help="Inference image resolution.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help="Inference batch size.",
    )
    parser.add_argument(
        "--device",
        type=str,
        default=DEFAULT_DEVICE,
        help="Compute device (e.g., '0', 'cpu', 'mps').",
    )
    parser.add_argument(
        "--io-workers",
        type=int,
        default=DEFAULT_IO_WORKERS,
        help="Number of background threads for file I/O.",
    )
    parser.add_argument(
        "--groups",
        nargs="+",
        default=DEFAULT_TRAIN_GROUPS,
        help="Dataset partition folders to scan.",
    )
    parser.add_argument(
        "--save-negatives",
        action="store_true",
        help="Save images with no detections as empty label files (reduces false positives).",
    )
    parser.add_argument(
        "--keep-existing",
        action="store_true",
        help="Do not wipe destination directory before running.",
    )
    return parser.parse_args()


def main() -> None:
    config = parse_args()
    started = time.monotonic()
    show_banner(config)

    if not config.source.is_dir():
        raise FileNotFoundError(f"Source folder not found: {config.source.resolve()}")
    if not config.model.is_file():
        raise FileNotFoundError(f"Model checkpoint not found: {config.model.resolve()}")

    candidates, group_stats = collect_candidates(config)
    if not candidates:
        console.print(
            Panel(
                "[yellow]No candidate images found.[/yellow]\n"
                "Verify dataset group paths and JSON annotations.",
                border_style="yellow",
                box=box.ROUNDED,
                expand=False,
            )
        )
        return

    console.print("[bold cyan]Loading YOLO Model[/bold cyan]")
    model = YOLO(str(config.model))
    target_class_id = resolve_target_class_id(model, TARGET_CLASS_NAME)
    console.print(
        f"[green]✓[/green] Model loaded. Target class '[cyan]{TARGET_CLASS_NAME}[/cyan]' -> ID {target_class_id}\n"
    )

    images_out, labels_out = prepare_output(
        config.output, clean=not config.keep_existing
    )
    yaml_path = write_dataset_yaml(config.output, class_id=0)

    total_accepted = 0
    total_rejected = 0
    total_negatives_saved = 0
    total_errors = 0
    total_boxes = 0
    confidence_history: list[float] = []

    console.rule("[bold cyan]Running Batched Inference[/bold cyan]")
    inference_started = time.monotonic()

    with make_progress() as progress:
        task = progress.add_task(
            "[green]Generating pseudo-labels", total=len(candidates)
        )

        with concurrent.futures.ThreadPoolExecutor(
            max_workers=config.io_workers
        ) as io_pool:
            io_futures: list[concurrent.futures.Future[None]] = []

            for batch in chunk_list(candidates, config.batch_size):
                batch_paths = [img_path for _, img_path in batch]
                results = predict_batch_with_fallback(model, batch_paths, config)

                for (group, image_path), result in zip(batch, results):
                    stats = group_stats[group]

                    if result is None:
                        stats.errors += 1
                        total_errors += 1
                        progress.advance(task)
                        continue

                    boxes = filter_valid_boxes(
                        result.boxes, target_class_id, config.conf
                    )

                    name = f"{group}__{image_path.stem}"
                    dst_image = images_out / f"{name}.jpg"
                    dst_label = labels_out / f"{name}.txt"

                    if boxes:
                        stats.accepted += 1
                        stats.detections += len(boxes)
                        total_accepted += 1
                        total_boxes += len(boxes)
                        confidence_history.extend(b.confidence for b in boxes)

                        io_futures.append(
                            io_pool.submit(
                                export_sample, image_path, dst_image, dst_label, boxes
                            )
                        )
                    else:
                        stats.rejected += 1
                        total_rejected += 1

                        if config.save_negatives:
                            total_negatives_saved += 1
                            io_futures.append(
                                io_pool.submit(
                                    export_sample, image_path, dst_image, dst_label, []
                                )
                            )

                    progress.advance(task)

            # Wait for all background file exports to finish
            concurrent.futures.wait(io_futures)

    inference_elapsed = time.monotonic() - inference_started
    total_elapsed = time.monotonic() - started
    fps = len(candidates) / inference_elapsed if inference_elapsed > 0 else 0.0

    # ---------------------------------------------------------
    # Final Statistics Presentation
    # ---------------------------------------------------------

    console.print()
    show_stats_table(
        "Pseudo-Label Execution Metrics",
        {
            "Candidate Images": len(candidates),
            "Accepted (Pseudo-labeled)": total_accepted,
            "Rejected (No detections)": total_rejected,
            "Saved Background Negatives": total_negatives_saved,
            "Inference Failures/Errors": total_errors,
            "Total Pothole Boxes": total_boxes,
            "Average Confidence": (
                mean(confidence_history) if confidence_history else 0.0
            ),
            "Inference Speed (img/sec)": fps,
            "Inference Runtime": f"{inference_elapsed:.2f} s",
            "Total Pipeline Runtime": f"{total_elapsed:.2f} s",
        },
    )

    group_table = Table(
        title="Partition Breakdown",
        box=box.ROUNDED,
        header_style="bold cyan",
    )
    group_table.add_column("Dataset Group")
    group_table.add_column("Accepted", justify="right")
    group_table.add_column("Rejected", justify="right")
    group_table.add_column("Errors", justify="right")
    group_table.add_column("Boxes", justify="right")

    for group in config.groups:
        st = group_stats[group]
        group_table.add_row(
            group,
            f"{st.accepted:,}",
            f"{st.rejected:,}",
            f"{st.errors:,}",
            f"{st.detections:,}",
        )

    console.print(group_table)

    console.print(
        Panel(
            "[bold green]PIPELINE COMPLETED SUCCESSFULLY[/bold green]\n\n"
            f"Images:   {images_out.resolve()}\n"
            f"Labels:   {labels_out.resolve()}\n"
            f"Config:   {yaml_path.resolve()}\n\n"
            f"[dim]Train directly with: yolo detect train data={yaml_path.resolve()} model={config.model}[/dim]",
            border_style="green",
            box=box.ROUNDED,
            expand=False,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        console.print("\n[yellow]Execution aborted by user.[/yellow]")
        raise SystemExit(130)
    except Exception as exc:
        console.print(f"\n[bold red]FATAL ERROR:[/bold red] {exc}")
        raise