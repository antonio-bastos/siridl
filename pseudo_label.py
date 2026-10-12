
import json
import shutil
import time
from collections import defaultdict
from pathlib import Path
from statistics import mean
from typing import cast

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
# Configuration
# ---------------------------------------------------------

SOURCE = Path("dataset")
MODEL_PATH = Path("runs/detect/runs/pothole/baseline/weights/best.pt")
OUTPUT = Path("pseudo_dataset")

CONFIDENCE = 0.75
IMAGE_SIZE = 640
DEVICE = 0  # Use 0 for the first NVIDIA GPU, or "cpu" for CPU inference.

TRAIN_GROUPS = [
    "ds1_simplex-train",
    "ds2_complex-train",
]

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

# Clear only OUTPUT/images and OUTPUT/labels before a new run.
# This prevents stale pseudo-labels from previous runs being mixed in.
CLEAN_OUTPUT = True

console = Console()


# ---------------------------------------------------------
# Terminal UI
# ---------------------------------------------------------

def show_banner():
    console.print()
    console.print(
        Panel(
            "[bold cyan]ROAD POTHOLE DETECTION[/bold cyan]\n"
            "[white]Pseudo-Label Generation[/white]\n"
            "[dim]Finding unlabeled images and generating high-confidence YOLO labels[/dim]",
            border_style="cyan",
            box=box.ROUNDED,
            expand=False,
        )
    )

    console.print(f"[dim]Dataset: {SOURCE.resolve()}[/dim]")
    console.print(f"[dim]Model: {MODEL_PATH.resolve()}[/dim]")
    console.print(f"[dim]Output: {OUTPUT.resolve()}[/dim]")
    console.print(
        f"[dim]Confidence threshold: {CONFIDENCE:.0%} | "
        f"Image size: {IMAGE_SIZE} | Device: {DEVICE}[/dim]"
    )
    console.print()


def make_progress():
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


def show_stats(title, stats):
    table = Table(
        title=title,
        box=box.ROUNDED,
        header_style="bold cyan",
    )
    table.add_column("Metric")
    table.add_column("Count", justify="right")

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
# Annotation inspection
# ---------------------------------------------------------

def has_pothole_annotation(json_path: Path) -> bool:
    """Return True if the JSON contains at least one pothole rectangle."""
    data = json.loads(json_path.read_text(encoding="utf-8"))

    return any(
        obj.get("classTitle", "").strip().lower() == "pothole"
        and obj.get("geometryType") == "rectangle"
        for obj in data.get("objects", [])
    )


# ---------------------------------------------------------
# Find candidate images
# ---------------------------------------------------------

def collect_candidates():
    candidates = []
    group_stats = {}

    console.rule("[bold cyan]Scanning dataset[/bold cyan]")

    for group in TRAIN_GROUPS:
        image_dir = SOURCE / group / "img"
        ann_dir = SOURCE / group / "ann"

        if not image_dir.is_dir() or not ann_dir.is_dir():
            raise FileNotFoundError(
                f"Expected both folders:\n"
                f"  {image_dir.resolve()}\n"
                f"  {ann_dir.resolve()}"
            )

        images = sorted(
            path
            for path in image_dir.rglob("*")
            if path.is_file()
            and path.suffix.lower() in IMAGE_EXTENSIONS
        )

        stats = {
            "images_scanned": len(images),
            "candidates": 0,
            "already_annotated": 0,
            "missing_annotations": 0,
            "invalid_annotations": 0,
        }

        with make_progress() as progress:
            task = progress.add_task(
                f"[cyan]Inspecting {group}",
                total=len(images),
            )

            for image_path in images:
                # Dataset annotation names look like image.JPG.json.
                ann_path = ann_dir / f"{image_path.name}.json"

                if not ann_path.is_file():
                    # Missing annotations do not prove that an image
                    # is a valid negative or safe pseudo-label candidate.
                    stats["missing_annotations"] += 1
                    progress.advance(task)
                    continue

                try:
                    annotated = has_pothole_annotation(ann_path)
                except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError):
                    stats["invalid_annotations"] += 1
                    progress.advance(task)
                    continue

                if annotated:
                    stats["already_annotated"] += 1
                else:
                    candidates.append((group, image_path))
                    stats["candidates"] += 1

                progress.advance(task)

        group_stats[group] = stats
        show_stats(group, stats)

    console.print(
        f"\n[bold]Total candidate images:[/bold] {len(candidates):,}"
    )

    return candidates, group_stats


# ---------------------------------------------------------
# Prepare output folders
# ---------------------------------------------------------

def prepare_output():
    images_out = OUTPUT / "images"
    labels_out = OUTPUT / "labels"

    if CLEAN_OUTPUT:
        for directory in (images_out, labels_out):
            if directory.exists():
                shutil.rmtree(directory)

    images_out.mkdir(parents=True, exist_ok=True)
    labels_out.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------
# Generate pseudo-labels
# ---------------------------------------------------------

def main():
    started = time.monotonic()
    show_banner()

    if not SOURCE.is_dir():
        raise FileNotFoundError(
            f"Dataset folder not found: {SOURCE.resolve()}"
        )

    if not MODEL_PATH.is_file():
        raise FileNotFoundError(
            f"Trained model not found: {MODEL_PATH.resolve()}\n"
            "Train the baseline model first or update MODEL_PATH."
        )

    candidates, group_stats = collect_candidates()

    if not candidates:
        console.print(
            Panel(
                "[yellow]No eligible candidate images were found.[/yellow]\n"
                "Check the dataset paths, annotation files and candidate counts.",
                border_style="yellow",
                expand=False,
            )
        )
        return

    console.print()
    console.print("[bold cyan]Loading YOLO model[/bold cyan]")
    model = YOLO(str(MODEL_PATH))
    console.print("[green]✓[/green] Model loaded.")

    prepare_output()

    accepted = 0
    rejected = 0
    errors = 0
    total_detections = 0
    confidence_scores = []

    per_group = defaultdict(
        lambda: {"accepted": 0, "rejected": 0, "errors": 0, "detections": 0}
    )

    inference_started = time.monotonic()

    console.rule("[bold cyan]Running inference[/bold cyan]")

    with make_progress() as progress:
        task = progress.add_task(
            "[green]Generating pseudo-labels",
            total=len(candidates),
        )

        for index, (group, image_path) in enumerate(candidates, start=1):
            try:
                predictions = model.predict(
                    source=str(image_path),
                    imgsz=IMAGE_SIZE,
                    conf=CONFIDENCE,
                    device=DEVICE,
                    verbose=False,
                    stream=False,
                )

                # With stream=False, predict normally returns a list of Results.
                results = cast(list[Results], predictions)

                if not results:
                    rejected += 1
                    per_group[group]["rejected"] += 1
                    progress.advance(task)
                    continue

                result = results[0]
                boxes = result.boxes

                selected = []

                if boxes is not None:
                    for detection in boxes:
                        class_id = int(detection.cls[0])
                        confidence = float(detection.conf[0])

                        # This model is expected to use class 0 for potholes.
                        if class_id == 0 and confidence >= CONFIDENCE:
                            selected.append(detection)

                if not selected:
                    rejected += 1
                    per_group[group]["rejected"] += 1
                    progress.advance(task)
                    continue

                # Group prefix prevents filename collisions.
                name = f"{group}__{image_path.stem}"
                image_out = OUTPUT / "images" / f"{name}.jpg"
                label_out = OUTPUT / "labels" / f"{name}.txt"

                # Convert images to actual JPEG format instead of copying
                # PNG/WEBP bytes into a file named .jpg.
                with Image.open(image_path) as im:
                    im.convert("RGB").save(
                        image_out,
                        format="JPEG",
                        quality=95,
                    )

                with label_out.open("w", encoding="utf-8") as f:
                    for detection in selected:
                        x, y, w, h = detection.xywhn[0].tolist()
                        confidence = float(detection.conf[0])

                        f.write(
                            f"0 {x:.6f} {y:.6f} "
                            f"{w:.6f} {h:.6f}\n"
                        )
                        confidence_scores.append(confidence)

                accepted += 1
                per_group[group]["accepted"] += 1
                per_group[group]["detections"] += len(selected)
                total_detections += len(selected)

            except Exception as exc:
                errors += 1
                per_group[group]["errors"] += 1
                console.print(
                    f"\n[yellow]Warning:[/yellow] "
                    f"{image_path.name}: {exc}"
                )

            progress.advance(task)

    inference_elapsed = time.monotonic() - inference_started
    total_elapsed = time.monotonic() - started

    # -----------------------------------------------------
    # Final statistics
    # -----------------------------------------------------

    console.print()

    show_stats(
        "Pseudo-Label Results",
        {
            "Candidate images": len(candidates),
            "Accepted images": accepted,
            "Rejected (no qualifying detections)": rejected,
            "Errors": errors,
            "Total pseudo-labeled boxes": total_detections,
            "Average confidence": (
                mean(confidence_scores) if confidence_scores else 0.0
            ),
            "Inference time (seconds)": inference_elapsed,
            "Inference speed (images/sec)": (
                len(candidates) / inference_elapsed
                if inference_elapsed > 0
                else 0.0
            ),
            "Total runtime (seconds)": total_elapsed,
        },
    )

    group_table = Table(
        title="Results by Dataset Group",
        box=box.ROUNDED,
        header_style="bold cyan",
    )
    group_table.add_column("Group")
    group_table.add_column("Accepted", justify="right")
    group_table.add_column("Rejected", justify="right")
    group_table.add_column("Errors", justify="right")
    group_table.add_column("Boxes", justify="right")

    for group in TRAIN_GROUPS:
        stats = per_group[group]
        group_table.add_row(
            group,
            f"{stats['accepted']:,}",
            f"{stats['rejected']:,}",
            f"{stats['errors']:,}",
            f"{stats['detections']:,}",
        )

    console.print(group_table)

    console.print(
        Panel(
            "[bold green]PSEUDO-LABEL GENERATION FINISHED[/bold green]\n\n"
            f"Accepted images: {accepted:,}\n"
            f"Generated boxes: {total_detections:,}\n"
            f"Total runtime: {total_elapsed:.1f} seconds\n\n"
            f"Images: {OUTPUT / 'images'}\n"
            f"Labels: {OUTPUT / 'labels'}",
            border_style="green",
            box=box.ROUNDED,
            expand=False,
        )
    )

    console.print(
        "[yellow]Important:[/yellow] Review pseudo-labels before using them "
        "for further training. High confidence does not guarantee correctness."
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        console.print("\n[yellow]Cancelled by user.[/yellow]")
        raise SystemExit(130)
    except Exception as exc:
        console.print(f"\n[bold red]ERROR:[/bold red] {exc}")
        raise
