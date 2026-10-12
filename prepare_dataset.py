
import json
import random
import shutil
import time
from pathlib import Path

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

# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------

# Change this to the actual name of your downloaded dataset folder.
SOURCE = Path("dataset")
OUTPUT = Path("dataset_yolo")

SEED = 42
VAL_RATIO = 0.10

TRAIN_GROUPS = [
    "ds1_simplex-train",
    "ds2_complex-train",
]

TEST_GROUPS = [
    "ds1_simplex-test",
    "ds2_complex-test",
]

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

# Clears previously generated images/labels inside OUTPUT.
# The original dataset in SOURCE is never modified.
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
            "[white]Dataset Preparation → YOLO Format[/white]\n"
            "[dim]Converting annotations, organizing splits and validating output[/dim]",
            border_style="cyan",
            box=box.ROUNDED,
            expand=False,
        )
    )
    console.print(f"[dim]Source: {SOURCE.resolve()}[/dim]")
    console.print(f"[dim]Output: {OUTPUT.resolve()}[/dim]")
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
        show_lines=False,
    )
    table.add_column("Metric")
    table.add_column("Count", justify="right")

    for name, value in stats.items():
        table.add_row(name, f"{value:,}" if isinstance(value, int) else str(value))

    console.print(table)


# ---------------------------------------------------------
# Annotation conversion
# ---------------------------------------------------------

def read_annotation(json_path, image_width, image_height):
    """Convert Supervisely pothole rectangles into normalized YOLO boxes."""
    with json_path.open("r", encoding="utf-8") as f:
        annotation = json.load(f)

    boxes = []

    for obj in annotation.get("objects", []):
        if obj.get("classTitle", "").strip().lower() != "pothole":
            continue

        if obj.get("geometryType") != "rectangle":
            continue

        exterior = obj.get("points", {}).get("exterior", [])
        if len(exterior) < 2:
            continue

        (x1, y1), (x2, y2) = exterior[:2]

        # Keep coordinates inside the image.
        x1 = max(0.0, min(float(x1), image_width))
        x2 = max(0.0, min(float(x2), image_width))
        y1 = max(0.0, min(float(y1), image_height))
        y2 = max(0.0, min(float(y2), image_height))

        left, right = sorted((x1, x2))
        top, bottom = sorted((y1, y2))

        if right <= left or bottom <= top:
            continue

        cx = ((left + right) / 2) / image_width
        cy = ((top + bottom) / 2) / image_height
        w = (right - left) / image_width
        h = (bottom - top) / image_height

        boxes.append((0, cx, cy, w, h))

    return boxes


# ---------------------------------------------------------
# Dataset scanning
# ---------------------------------------------------------

def collect_group(group_name, split):
    image_dir = SOURCE / group_name / "img"
    ann_dir = SOURCE / group_name / "ann"

    if not image_dir.is_dir() or not ann_dir.is_dir():
        raise FileNotFoundError(
            f"Expected both folders:\n"
            f"  {image_dir.resolve()}\n"
            f"  {ann_dir.resolve()}"
        )

    image_paths = sorted(
        path
        for path in image_dir.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    )

    stats = {
        "images": len(image_paths),
        "labeled": 0,
        "empty": 0,
        "missing": 0,
        "invalid": 0,
        "boxes": 0,
    }

    samples = []

    console.rule(f"[bold cyan]Scanning {group_name}[/bold cyan]")
    console.print(f"[dim]Split: {split} | Images found: {len(image_paths):,}[/dim]")

    with make_progress() as progress:
        task = progress.add_task(
            f"[cyan]Scanning {group_name}",
            total=len(image_paths),
        )

        for image_path in image_paths:
            # Important: filenames are e.g. image.JPG.json,
            # so use image_path.name, not image_path.stem.
            ann_path = ann_dir / f"{image_path.name}.json"

            if not ann_path.is_file():
                stats["missing"] += 1
                progress.advance(task)
                continue

            try:
                with Image.open(image_path) as im:
                    width, height = im.size

                if width <= 0 or height <= 0:
                    raise ValueError("Image has invalid dimensions")

                boxes = read_annotation(ann_path, width, height)

            except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
                stats["invalid"] += 1
                console.print(
                    f"[yellow]Skipped invalid pair:[/yellow] "
                    f"{image_path.name} — {exc}"
                )
                progress.advance(task)
                continue

            if not boxes:
                # Preserve the current policy: don't train on images
                # unless they have at least one valid pothole box.
                stats["empty"] += 1
                progress.advance(task)
                continue

            stats["labeled"] += 1
            stats["boxes"] += len(boxes)
            samples.append((group_name, image_path, boxes, split))

            progress.advance(task)

    show_stats(group_name, stats)
    return samples, stats


# ---------------------------------------------------------
# Output preparation
# ---------------------------------------------------------

def prepare_output():
    OUTPUT.mkdir(parents=True, exist_ok=True)

    if CLEAN_OUTPUT:
        # Remove only generated output directories, never SOURCE.
        for directory in [OUTPUT / "images", OUTPUT / "labels"]:
            if directory.exists():
                shutil.rmtree(directory)

    for split in ["train", "val", "test"]:
        (OUTPUT / "images" / split).mkdir(parents=True, exist_ok=True)
        (OUTPUT / "labels" / split).mkdir(parents=True, exist_ok=True)


def write_sample(sample, split):
    group_name, image_path, boxes, _ = sample

    # Prefix group names to prevent filename collisions.
    output_name = f"{group_name}__{image_path.stem}"

    image_out = OUTPUT / "images" / split / f"{output_name}.jpg"
    label_out = OUTPUT / "labels" / split / f"{output_name}.txt"

    with Image.open(image_path) as im:
        im.convert("RGB").save(image_out, format="JPEG", quality=95)

    with label_out.open("w", encoding="utf-8") as f:
        for cls, cx, cy, w, h in boxes:
            f.write(
                f"{cls} {cx:.6f} {cy:.6f} "
                f"{w:.6f} {h:.6f}\n"
            )


def write_samples(samples, split):
    started = time.monotonic()
    total_boxes = sum(len(sample[2]) for sample in samples)

    console.rule(f"[bold cyan]Writing {split} dataset[/bold cyan]")

    with make_progress() as progress:
        task = progress.add_task(
            f"[green]Writing {split} images and labels",
            total=len(samples),
        )

        for sample in samples:
            write_sample(sample, split)
            progress.advance(task)

    elapsed = time.monotonic() - started
    speed = len(samples) / elapsed if elapsed > 0 else 0

    console.print(
        f"[green]✓[/green] {split}: "
        f"{len(samples):,} images, {total_boxes:,} boxes "
        f"in {elapsed:.1f}s ({speed:.1f} images/s)"
    )


# ---------------------------------------------------------
# Main
# ---------------------------------------------------------

def main():
    started = time.monotonic()
    show_banner()

    if not SOURCE.is_dir():
        raise FileNotFoundError(
            f"Dataset folder not found: {SOURCE.resolve()}\n"
            "Update SOURCE at the top of prepare_dataset.py."
        )

    random.seed(SEED)

    train_samples = []
    test_samples = []
    group_stats = {}

    # Scan original training groups.
    for group in TRAIN_GROUPS:
        samples, stats = collect_group(group, "train")
        train_samples.extend(samples)
        group_stats[group] = stats

    # Scan original test groups.
    for group in TEST_GROUPS:
        samples, stats = collect_group(group, "test")
        test_samples.extend(samples)
        group_stats[group] = stats

    if len(train_samples) < 2:
        console.print(
            "[bold red]Not enough labeled training images.[/bold red]"
        )
        console.print(
            "Check the annotation matching, JSON contents, and class names."
        )
        console.print(
            "Images without valid pothole boxes are currently excluded."
        )
        return

    if not test_samples:
        console.print(
            "[yellow]Warning:[/yellow] No labeled test images were found."
        )

    # Split only the provided training data.
    random.shuffle(train_samples)
    val_count = max(1, round(len(train_samples) * VAL_RATIO))

    val_samples = train_samples[:val_count]
    train_samples = train_samples[val_count:]

    console.print()
    console.print("[bold cyan]Dataset split[/bold cyan]")
    show_stats(
        "Planned Output",
        {
            "Training images": len(train_samples),
            "Validation images": len(val_samples),
            "Test images": len(test_samples),
            "Total images": len(train_samples) + len(val_samples) + len(test_samples),
            "Training pothole boxes": sum(len(s[2]) for s in train_samples),
            "Validation pothole boxes": sum(len(s[2]) for s in val_samples),
            "Test pothole boxes": sum(len(s[2]) for s in test_samples),
        },
    )

    # Clear old generated output so stale files aren't accidentally used.
    prepare_output()

    write_samples(train_samples, "train")
    write_samples(val_samples, "val")
    write_samples(test_samples, "test")

    # Write YOLO dataset configuration.
    dataset_root = OUTPUT.resolve().as_posix()
    yaml_text = (
        f"path: {dataset_root}\n"
        "train: images/train\n"
        "val: images/val\n"
        "test: images/test\n"
        "\n"
        "names:\n"
        "  0: pothole\n"
    )

    (OUTPUT / "data.yaml").write_text(yaml_text, encoding="utf-8")

    elapsed = time.monotonic() - started

    console.print()
    console.print(
        Panel(
            "[bold green]DATASET PREPARATION COMPLETE[/bold green]\n\n"
            f"Training:   {len(train_samples):,} images\n"
            f"Validation: {len(val_samples):,} images\n"
            f"Test:       {len(test_samples):,} images\n\n"
            f"Total time: {elapsed:.1f} seconds\n"
            f"YOLO config: {OUTPUT / 'data.yaml'}",
            border_style="green",
            box=box.ROUNDED,
            expand=False,
        )
    )

    console.print(
        "[dim]Review the counts before starting model training.[/dim]"
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
