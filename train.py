
import time
from pathlib import Path

from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from ultralytics import YOLO


# ---------------------------------------------------------
# Configuration
# ---------------------------------------------------------

BASE_MODEL = "yolo11s.pt"
DATA_YAML = Path("dataset_yolo/data.yaml")

PROJECT = Path.cwd() / "runs" / "pothole"
RUN_NAME = "baseline"
RUN_DIR = PROJECT / RUN_NAME
BEST_WEIGHTS = RUN_DIR / "weights" / "best.pt"

EPOCHS = 100
IMAGE_SIZE = 1088
BATCH_SIZE = 8
DEVICE = 0
WORKERS = 8
PATIENCE = 20
SEED = 42

console = Console()


# ---------------------------------------------------------
# Terminal UI
# ---------------------------------------------------------

def show_banner():
    console.print()
    console.print(
        Panel(
            "[bold cyan]ROAD POTHOLE DETECTION[/bold cyan]\n"
            "[white]YOLO Training & Evaluation[/white]\n"
            "[dim]Train a baseline detector and evaluate it on held-out test data[/dim]",
            border_style="cyan",
            box=box.ROUNDED,
            expand=False,
        )
    )


def show_configuration():
    table = Table(
        title="Training Configuration",
        box=box.ROUNDED,
        header_style="bold cyan",
    )
    table.add_column("Setting")
    table.add_column("Value", justify="right")

    settings = {
        "Base model": BASE_MODEL,
        "Dataset config": str(DATA_YAML),
        "Epochs": EPOCHS,
        "Image size": IMAGE_SIZE,
        "Batch size": BATCH_SIZE,
        "Device": DEVICE,
        "Workers": WORKERS,
        "Early stopping patience": PATIENCE,
        "Random seed": SEED,
        "Run directory": str(RUN_DIR),
    }

    for key, value in settings.items():
        table.add_row(key, str(value))

    console.print(table)


def show_metrics(metrics):
    """Display common Ultralytics detection metrics when available."""
    results = getattr(metrics, "results_dict", {}) or {}

    table = Table(
        title="Held-Out Test Results",
        box=box.ROUNDED,
        header_style="bold cyan",
    )
    table.add_column("Metric")
    table.add_column("Score", justify="right")

    preferred_metrics = [
        ("metrics/precision(B)", "Precision"),
        ("metrics/recall(B)", "Recall"),
        ("metrics/mAP50(B)", "mAP@50"),
        ("metrics/mAP50-95(B)", "mAP@50–95"),
    ]

    displayed = 0

    for key, label in preferred_metrics:
        if key in results:
            try:
                score = float(results[key])
                table.add_row(label, f"{score:.4f} ({score * 100:.2f}%)")
                displayed += 1
            except (TypeError, ValueError):
                continue

    if displayed:
        console.print(table)
    else:
        console.print("[yellow]Could not extract standard metrics automatically.[/yellow]")
        console.print(metrics)


# ---------------------------------------------------------
# Training and evaluation
# ---------------------------------------------------------

def main():
    started = time.monotonic()
    show_banner()
    show_configuration()

    if not DATA_YAML.is_file():
        raise FileNotFoundError(
            f"Dataset configuration not found: {DATA_YAML.resolve()}\n"
            "Run your dataset preparation script first."
        )

    console.print()
    console.rule("[bold cyan]Loading model[/bold cyan]")

    model = YOLO(BASE_MODEL)
    console.print(f"[green]✓[/green] Loaded {BASE_MODEL}")

    console.print()
    console.rule("[bold cyan]Training baseline[/bold cyan]")
    console.print(
        "[dim]Ultralytics will display live epoch progress, losses and validation metrics below.[/dim]\n"
    )

    training_started = time.monotonic()

    model.train(
        data=str(DATA_YAML),
        epochs=EPOCHS,
        imgsz=IMAGE_SIZE,
        batch=BATCH_SIZE,
        device=DEVICE,
        workers=WORKERS,
        patience=PATIENCE,
        seed=SEED,
        project=PROJECT,
        name=RUN_NAME,
    )

    training_elapsed = time.monotonic() - training_started

    console.print()
    console.print(
        Panel(
            "[bold green]TRAINING FINISHED[/bold green]\n\n"
            f"Training time: {training_elapsed / 60:.1f} minutes\n"
            f"Run directory: {RUN_DIR.resolve()}",
            border_style="green",
            box=box.ROUNDED,
            expand=False,
        )
    )

    if not BEST_WEIGHTS.is_file():
        raise FileNotFoundError(
            f"Best model weights were not found at {BEST_WEIGHTS.resolve()}.\n"
            "Check the training output and run directory."
        )

    console.print()
    console.rule("[bold cyan]Evaluating on held-out test set[/bold cyan]")
    console.print(
        "[yellow]Keep the test set for final evaluation; don't use it to tune the model repeatedly.[/yellow]\n"
    )

    best = YOLO(str(BEST_WEIGHTS))

    evaluation_started = time.monotonic()

    metrics = best.val(
        data=str(DATA_YAML),
        split="test",
        imgsz=IMAGE_SIZE,
        device=DEVICE,
    )

    evaluation_elapsed = time.monotonic() - evaluation_started

    console.print()
    show_metrics(metrics)

    total_elapsed = time.monotonic() - started

    console.print(
        Panel(
            "[bold green]PIPELINE COMPLETE[/bold green]\n\n"
            f"Best weights: {BEST_WEIGHTS.resolve()}\n"
            f"Training: {training_elapsed / 60:.1f} minutes\n"
            f"Evaluation: {evaluation_elapsed:.1f} seconds\n"
            f"Total runtime: {total_elapsed / 60:.1f} minutes",
            border_style="green",
            box=box.ROUNDED,
            expand=False,
        )
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