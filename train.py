import argparse
import json
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

# Ensure UTF-8 output on Windows PowerShell / CMD
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        reconfigure = getattr(sys.stdout, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import yaml
from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from ultralytics import YOLO

console = Console(record=True)


# ---------------------------------------------------------
# CLI Arguments
# ---------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Train YOLO detector for road potholes",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    g_model = p.add_argument_group("data / model")
    default_model = "weights/yolo11s.pt" if Path("weights/yolo11s.pt").is_file() else "yolo11s.pt"
    g_model.add_argument("--model", default=default_model, help="Base weights or pretrained checkpoint")
    g_model.add_argument("--data", type=Path, default=Path("dataset_yolo/data.yaml"), help="Path to data.yaml")
    g_model.add_argument("--project", type=Path, default=Path.cwd() / "runs" / "pothole", help="Root run directory")
    g_model.add_argument("--name", default="baseline", help="Run identifier")
    g_model.add_argument("--resume", type=Path, default=None, help="Path to last.pt to resume")

    g_train = p.add_argument_group("training")
    g_train.add_argument("--epochs", type=int, default=100)
    g_train.add_argument("--imgsz", type=int, default=1280, help="Image resolution (640 or 1280)")
    g_train.add_argument("--batch", type=int, default=8, help="Batch size (8 is safe for 1280px on 16GB VRAM; use 16 for 640px)")
    g_train.add_argument("--device", default="0", help="CUDA device index (e.g. 0) or 'cpu'")
    g_train.add_argument("--workers", type=int, default=4, help="DataLoader workers (4 recommended for Windows)")
    g_train.add_argument("--patience", type=int, default=30, help="Early stopping patience in epochs")
    g_train.add_argument("--seed", type=int, default=42)
    g_train.add_argument("--cache", default="False", choices=["False", "disk", "ram"],
                         help="Dataset caching (use 'False' or 'disk' to prevent Windows paging)")
    g_train.add_argument("--cos-lr", action="store_true", default=True, help="Cosine learning rate decay")
    g_train.add_argument("--close-mosaic", type=int, default=10, help="Disable mosaic for the final N epochs")
    g_train.add_argument("--save-period", type=int, default=-1, help="Save weights every N epochs (-1 = disabled)")

    g_aug = p.add_argument_group("road-specific augmentations")
    g_aug.add_argument("--scale", type=float, default=0.8, help="Scale jitter (+/- 80%% to catch small and huge potholes)")
    g_aug.add_argument("--mixup", type=float, default=0.1, help="MixUp probability for blending asphalt textures")
    g_aug.add_argument("--mosaic", type=float, default=1.0, help="Mosaic augmentation probability")

    g_eval = p.add_argument_group("evaluation / export")
    g_eval.add_argument("--eval-split", default="test", choices=["test", "val"])
    g_eval.add_argument("--export", default=None, help="Export format post-eval: onnx, engine, openvino")

    return p.parse_args()


# ---------------------------------------------------------
# Helpers & Preflight
# ---------------------------------------------------------

def fmt(seconds: float) -> str:
    return str(timedelta(seconds=max(0, int(seconds))))


def preflight(args: argparse.Namespace) -> dict:
    if not args.data.is_file():
        raise FileNotFoundError(
            f"Dataset config not found: {args.data.resolve()}\nRun prepare_dataset.py first."
        )

    # Safe UTF-8 reading for Windows
    cfg = yaml.safe_load(args.data.read_text(encoding="utf-8")) or {}
    for key in ("train", "val", "names"):
        if key not in cfg:
            raise ValueError(f"'{key}' missing from {args.data}")

    if args.eval_split == "test" and "test" not in cfg:
        console.print("[yellow]No 'test' split in data.yaml; falling back to 'val' for evaluation.[/yellow]")
        args.eval_split = "val"

    if str(args.device) not in ("cpu", "mps"):
        import torch
        if not torch.cuda.is_available():
            console.print("[yellow]CUDA not available; falling back to CPU.[/yellow]")
            args.device = "cpu"
        else:
            idx = int(str(args.device).split(",")[0])
            props = torch.cuda.get_device_properties(idx)
            console.print(f"[green]✓[/green] GPU {idx}: {props.name} ({props.total_memory / 1e9:.1f} GB)")

    # Normalize boolean string
    if args.cache.lower() == "false":
        args.cache = False

    return cfg


def show_banner() -> None:
    console.print()
    console.print(Panel(
        "[bold cyan]ROAD POTHOLE DETECTION[/bold cyan]\n"
        "[white]YOLO Training & Evaluation Pipeline[/white]\n"
        "[dim]Optimized for RTX 40-series and road pavement scale variance[/dim]",
        border_style="cyan", box=box.ROUNDED, expand=False,
    ))


def show_configuration(args: argparse.Namespace, cfg: dict) -> None:
    table = Table(title="Training Configuration", box=box.ROUNDED, header_style="bold cyan")
    table.add_column("Setting")
    table.add_column("Value", justify="right")

    names = cfg["names"].values() if isinstance(cfg["names"], dict) else cfg["names"]
    rows = {
        "Base model": args.model if not args.resume else f"resume ← {args.resume}",
        "Dataset": str(args.data),
        "Classes": ", ".join(map(str, names)),
        "Epochs / Patience": f"{args.epochs} / {args.patience}",
        "Image size": f"{args.imgsz} px",
        "Batch size": args.batch,
        "Device / Workers": f"{args.device} / {args.workers}",
        "Cache mode": str(args.cache),
        "Scale jitter / MixUp": f"{args.scale} / {args.mixup}",
        "Cosine LR / Close mosaic": f"{args.cos_lr} / last {args.close_mosaic} epochs",
        "Seed": args.seed,
        "Eval split": args.eval_split,
        "Run output": str(args.project / args.name),
    }
    for k, v in rows.items():
        table.add_row(k, str(v))
    console.print(table)


# ---------------------------------------------------------
# Training Monitor Callback
# ---------------------------------------------------------

class TrainingMonitor:
    EMA_ALPHA = 0.3

    def __init__(self) -> None:
        self.start: float | None = None
        self.last_tick: float | None = None
        self.ema: float | None = None
        self.epochs_done = 0

    def on_train_start(self, trainer) -> None:
        self.start = self.last_tick = time.monotonic()
        console.print()
        console.rule("[bold cyan]Live Training Progress[/bold cyan]")

    def on_train_epoch_start(self, trainer) -> None:
        if self.epochs_done == 0:
            self.last_tick = time.monotonic()

    def on_fit_epoch_end(self, trainer) -> None:
        if self.start is None or self.last_tick is None:
            return

        now = time.monotonic()
        duration = now - self.last_tick
        self.last_tick = now
        self.epochs_done += 1

        self.ema = duration if self.ema is None else (
            self.EMA_ALPHA * duration + (1 - self.EMA_ALPHA) * self.ema
        )

        total = int(trainer.epochs)
        completed = int(trainer.epoch) + 1
        remaining = max(0, total - completed) * self.ema
        finish = datetime.now() + timedelta(seconds=remaining)

        m = trainer.metrics or {}
        map50 = m.get("metrics/mAP50(B)") or m.get("metrics/mAP_0.5")
        map5095 = m.get("metrics/mAP50-95(B)") or m.get("metrics/mAP_0.5:0.95")

        fitness = getattr(trainer, "fitness", None)
        best_fitness = getattr(trainer, "best_fitness", None)
        is_best = fitness is not None and best_fitness is not None and fitness >= best_fitness

        stopper = getattr(trainer, "stopper", None)
        since_best = completed - getattr(stopper, "best_epoch", completed) if stopper else 0
        patience = getattr(stopper, "patience", "?")

        parts = [
            f"[bold]Epoch {completed}/{total}[/bold] ({completed / total * 100:.0f}%)",
            f"elapsed {fmt(now - self.start)}",
            f"left ≤{fmt(remaining)}",
            f"ETA {finish:%H:%M}",
            f"{duration:.1f}s/epoch",
        ]
        if map50 is not None:
            parts.append(f"mAP50 {map50:.3f}")
        if map5095 is not None:
            parts.append(f"mAP50-95 {map5095:.3f}")

        parts.append("[green]★ best[/green]" if is_best else f"[dim]no gain {since_best}/{patience}[/dim]")
        console.print(" [dim]|[/dim] ".join(parts))

    def on_train_end(self, trainer) -> None:
        if self.start is None:
            return
        console.print()
        console.print(Panel(
            f"[bold green]Training Phase Completed[/bold green]\n\n"
            f"Epochs executed: {self.epochs_done}\n"
            f"Total duration: {fmt(time.monotonic() - self.start)}",
            border_style="green", box=box.ROUNDED, expand=False,
        ))

    def attach(self, model: YOLO) -> None:
        for name in ("on_train_start", "on_train_epoch_start", "on_fit_epoch_end", "on_train_end"):
            model.add_callback(name, getattr(self, name))


# ---------------------------------------------------------
# Evaluation Reporting
# ---------------------------------------------------------

def collect_metrics(metrics) -> dict:
    box_m = metrics.box
    out = {
        "precision": float(box_m.mp),
        "recall": float(box_m.mr),
        "mAP50": float(box_m.map50),
        "mAP50-95": float(box_m.map),
        "per_class": {},
        "speed_ms": {k: round(float(v), 2) for k, v in (getattr(metrics, "speed", {}) or {}).items()},
    }
    denom = max(1e-9, out["precision"] + out["recall"])
    out["f1"] = 2 * (out["precision"] * out["recall"]) / denom

    if hasattr(box_m, "ap_class_index") and len(box_m.ap_class_index) > 0:
        for i, cls_idx in enumerate(box_m.ap_class_index):
            p, r, ap50, ap = box_m.class_result(i)
            cls_name = metrics.names[int(cls_idx)]
            out["per_class"][cls_name] = {
                "precision": float(p),
                "recall": float(r),
                "mAP50": float(ap50),
                "mAP50-95": float(ap),
            }
    return out


def show_metrics(result: dict, split: str) -> None:
    table = Table(title=f"Evaluation Results ({split} split)", box=box.ROUNDED, header_style="bold cyan")
    table.add_column("Class")
    for col in ("Precision", "Recall", "mAP@50", "mAP@50–95"):
        table.add_column(col, justify="right")

    for name, c in result["per_class"].items():
        table.add_row(name, f"{c['precision']:.4f}", f"{c['recall']:.4f}",
                      f"{c['mAP50']:.4f}", f"{c['mAP50-95']:.4f}")
    if result["per_class"]:
        table.add_section()
    table.add_row("[bold]ALL[/bold]", f"{result['precision']:.4f}", f"{result['recall']:.4f}",
                  f"{result['mAP50']:.4f}", f"{result['mAP50-95']:.4f}")
    console.print(table)
    console.print(f"[dim]F1-Score: {result['f1']:.4f}[/dim]")

    if result["speed_ms"]:
        s = result["speed_ms"]
        total = sum(s.values())
        fps = (1000.0 / total) if total > 0 else 0
        console.print(
            f"[dim]Latency: preprocess {s.get('preprocess', 0):.1f} ms · "
            f"inference {s.get('inference', 0):.1f} ms · postprocess {s.get('postprocess', 0):.1f} ms "
            f"(≈{fps:.0f} FPS)[/dim]"
        )


# ---------------------------------------------------------
# Main
# ---------------------------------------------------------

def main() -> None:
    args = parse_args()
    pipeline_start = time.monotonic()

    show_banner()
    cfg = preflight(args)
    show_configuration(args, cfg)

    # 1. Initialize Model
    console.print()
    console.rule("[bold cyan]Loading Model[/bold cyan]")
    model = YOLO(str(args.resume) if args.resume else args.model)
    console.print(f"[green]✓[/green] Loaded: {args.resume or args.model}")

    monitor = TrainingMonitor()
    monitor.attach(model)

    # 2. Train
    console.print()
    console.rule("[bold cyan]Training Pothole Detector[/bold cyan]")
    train_start = time.monotonic()

    try:
        if args.resume:
            model.train(resume=True)
        else:
            model.train(
                data=str(args.data),
                epochs=args.epochs,
                imgsz=args.imgsz,
                batch=args.batch,
                device=args.device,
                workers=args.workers,
                patience=args.patience,
                seed=args.seed,
                deterministic=False,       # Enables cuDNN auto-tuner for max speed on RTX 4060 Ti
                cache=args.cache,
                cos_lr=args.cos_lr,
                close_mosaic=args.close_mosaic,
                save_period=args.save_period,
                project=str(args.project),
                name=args.name,
                exist_ok=False,
                # Road detection augmentations:
                scale=args.scale,          # Broad scale variation for near/far potholes
                mixup=args.mixup,          # Blends asphalt patches and puddles
                mosaic=args.mosaic,
                fliplr=0.5,
                flipud=0.0,                # Roads are never upside down
                degrees=3.0,               # Mild camera vibration
                perspective=0.0005,        # Road perspective distortion
            )
    except KeyboardInterrupt:
        trainer = getattr(model, "trainer", None)
        save_dir = getattr(trainer, "save_dir", None)
        console.print("\n[yellow]Training interrupted by user.[/yellow]")
        if isinstance(save_dir, (str, Path)):
            last_pt = Path(save_dir) / "weights" / "last.pt"
            console.print(f"Resume with:\n  [cyan]python {Path(__file__).name} --resume {last_pt}[/cyan]")
        raise SystemExit(130)

    train_elapsed = time.monotonic() - train_start

    # Locate output directory
    trainer = getattr(model, "trainer", None)
    if trainer is None or getattr(trainer, "save_dir", None) is None:
        raise RuntimeError("Training failed to produce a valid run directory.")

    save_dir = Path(trainer.save_dir)
    best_weights = save_dir / "weights" / "best.pt"
    if not best_weights.is_file():
        raise FileNotFoundError(f"best.pt not found at: {best_weights.resolve()}")

    console.print(Panel(
        f"[bold green]TRAINING FINISHED[/bold green]\n\n"
        f"Training time: {train_elapsed / 60:.1f} min\n"
        f"Artifacts saved: {save_dir.resolve()}",
        border_style="green", box=box.ROUNDED, expand=False,
    ))

    # 3. Evaluate
    console.print()
    console.rule(f"[bold cyan]Evaluating on '{args.eval_split}' split[/bold cyan]")

    best = YOLO(str(best_weights))
    eval_start = time.monotonic()
    metrics = best.val(
        data=str(args.data),
        split=args.eval_split,
        imgsz=args.imgsz,
        device=args.device,
        plots=True,
        project=str(save_dir),
        name=f"eval_{args.eval_split}",
        exist_ok=True,
    )
    eval_elapsed = time.monotonic() - eval_start

    result = collect_metrics(metrics)
    console.print()
    show_metrics(result, args.eval_split)

    # 4. Optional Model Export
    exported = None
    if args.export:
        console.print()
        console.rule(f"[bold cyan]Exporting to {args.export}[/bold cyan]")
        exported = best.export(
            format=args.export,
            imgsz=args.imgsz,
            device=args.device,
            batch=1,
        )
        console.print(f"[green]✓[/green] Exported: {exported}")

    # 5. Persist Summary
    summary = {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "args": {k: str(v) for k, v in vars(args).items()},
        "best_weights": str(best_weights.resolve()),
        "exported": str(exported) if exported else None,
        "training_time_min": round(train_elapsed / 60, 2),
        "evaluation_time_sec": round(eval_elapsed, 1),
        "eval_split": args.eval_split,
        "metrics": result,
    }
    (save_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    console.save_text(str(save_dir / "console_log.txt"))

    total_elapsed = time.monotonic() - pipeline_start
    console.print(Panel(
        f"[bold green]PIPELINE COMPLETE[/bold green]\n\n"
        f"Best model: {best_weights.resolve()}\n"
        f"Total run time: {total_elapsed / 60:.1f} min",
        border_style="green", box=box.ROUNDED, expand=False,
    ))


if __name__ == "__main__":
    main()