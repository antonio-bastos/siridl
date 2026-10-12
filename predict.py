#!/usr/bin/env python3
"""Run the pothole detector on an image, folder, glob, video, URL or webcam.

Examples:
    python predict_pothole.py reference.jpg
    python predict_pothole.py photos/ --conf 0.25 --save-crops
    python predict_pothole.py "dashcam/*.jpg" --csv --json
    python predict_pothole.py drive.mp4 --imgsz 1280
    python predict_pothole.py 0                      # webcam
    python predict_pothole.py reference.jpg --model runs/pothole/baseline/weights/best.pt --tta
"""

from __future__ import annotations

import argparse
import csv
import json
import time
from pathlib import Path

from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from ultralytics import YOLO

console = Console()

URL_PREFIXES = ("http://", "https://", "rtsp://", "rtmp://")
MAX_DETAIL_IMAGES = 5     # show per-detection tables up to this many images
MAX_SUMMARY_ROWS = 30     # rows in the per-image summary table


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
    p.add_argument("--conf", type=float, default=0.20, help="Confidence threshold")
    p.add_argument("--iou", type=float, default=0.70, help="NMS IoU threshold")
    p.add_argument("--imgsz", type=int, default=1280,
                   help="Inference size. Best results when it matches the training size")
    p.add_argument("--max-det", type=int, default=300)
    p.add_argument("--device", default="0", help="CUDA index, 'cpu', or 'mps'")
    p.add_argument("--tta", action="store_true", help="Test-time augmentation (slower, often finds more)")
    p.add_argument("--no-half", dest="half", action="store_false", help="Disable FP16 on GPU")
    p.add_argument("--project", type=Path, default=Path("predictions"))
    p.add_argument("--name", default="results")
    p.add_argument("--no-save", dest="save", action="store_false", help="Don't write annotated images/videos")
    p.add_argument("--hide-labels", action="store_true")
    p.add_argument("--line-width", type=int, default=None)
    p.add_argument("--save-txt", action="store_true", help="Save YOLO-format label files")
    p.add_argument("--save-crops", action="store_true", help="Save a crop of every detection")
    p.add_argument("--json", action="store_true", help="Write detections.json")
    p.add_argument("--csv", action="store_true", help="Write detections.csv")
    return p.parse_args()


# ---------------------------------------------------------
# Helpers
# ---------------------------------------------------------

def find_latest_model() -> Path | None:
    candidates = list(Path("runs").glob("**/weights/best.pt"))
    return max(candidates, key=lambda p: p.stat().st_mtime) if candidates else None


def resolve_model(path: Path | None) -> Path:
    if path is None:
        path = find_latest_model()
        if path is None:
            raise FileNotFoundError("No trained weights found under runs/**/weights/best.pt.\n"
                                    "Train a model first or pass --model.")
        console.print(f"[dim]Auto-selected newest model: {path}[/dim]")
    if not path.is_file():
        raise FileNotFoundError(f"Model not found: {path}\nMake sure training completed and best.pt exists.")
    return path


def validate_source(source: str) -> None:
    if source.isdigit() or source.startswith(URL_PREFIXES) or any(c in source for c in "*?["):
        return
    if not Path(source).exists():
        raise FileNotFoundError(f"Source not found: {source}\n"
                                "Pass an image/folder/video path, a glob, a URL, or a webcam index.")


def resolve_device(device: str) -> str:
    if device in ("cpu", "mps"):
        return device
    import torch
    if not torch.cuda.is_available():
        console.print("[yellow]CUDA not available; falling back to CPU.[/yellow]")
        return "cpu"
    idx = int(device.split(",")[0])
    console.print(f"[green]✓[/green] GPU {idx}: {torch.cuda.get_device_name(idx)}")
    return device


def extract(result) -> dict:
    """Pull plain-Python detections out of an Ultralytics Results object."""
    h, w = result.orig_shape
    dets = []
    if result.boxes is not None and len(result.boxes):
        xyxy = result.boxes.xyxy.cpu().numpy()
        conf = result.boxes.conf.cpu().numpy()
        for (x1, y1, x2, y2), c in sorted(zip(xyxy, conf), key=lambda t: -t[1]):
            dets.append({
                "confidence": round(float(c), 4),
                "x1": round(float(x1), 1), "y1": round(float(y1), 1),
                "x2": round(float(x2), 1), "y2": round(float(y2), 1),
                "width": round(float(x2 - x1), 1), "height": round(float(y2 - y1), 1),
                "area_pct": round(float((x2 - x1) * (y2 - y1) / (w * h) * 100), 3),
            })
    return {
        "image": str(result.path),
        "width": int(w), "height": int(h),
        "count": len(dets),
        "detections": dets,
        "speed_ms": {k: round(float(v), 1) for k, v in (result.speed or {}).items()},
    }


# ---------------------------------------------------------
# Reporting
# ---------------------------------------------------------

def show_detail(record: dict) -> None:
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


def show_summary(records: list[dict]) -> None:
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
        console.print(f"[dim]Showing the {len(shown)} images with the most detections. "
                      "Use --csv or --json for everything.[/dim]")


def write_csv(path: Path, records: list[dict]) -> None:
    fields = ["image", "width", "height", "confidence", "x1", "y1", "x2", "y2", "box_width", "box_height", "area_pct"]
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(fields)
        for r in records:
            for d in r["detections"]:
                w.writerow([r["image"], r["width"], r["height"], d["confidence"], d["x1"], d["y1"],
                            d["x2"], d["y2"], d["width"], d["height"], d["area_pct"]])


# ---------------------------------------------------------
# Main
# ---------------------------------------------------------

def main() -> None:
    args = parse_args()

    console.print()
    console.print(Panel(
        "[bold cyan]POTHOLE DETECTION[/bold cyan]\n[dim]Inference with per-detection report and exports[/dim]",
        border_style="cyan", box=box.ROUNDED, expand=False,
    ))

    validate_source(args.source)
    model_path = resolve_model(args.model)
    device = resolve_device(args.device)

    source = int(args.source) if args.source.isdigit() else args.source
    model = YOLO(str(model_path))
    console.print(f"[green]✓[/green] Loaded {model_path}")
    console.print(f"[dim]conf={args.conf} · iou={args.iou} · imgsz={args.imgsz} · tta={args.tta} · "
                  f"half={args.half and device not in ('cpu', 'mps')}[/dim]\n")

    # stream=True yields results one at a time, so large folders and videos don't fill memory.
    stream = model.predict(
        source=source,
        conf=args.conf,
        iou=args.iou,
        imgsz=args.imgsz,
        max_det=args.max_det,
        device=device,
        half=args.half and device not in ("cpu", "mps"),
        augment=args.tta,
        save=args.save,
        save_txt=args.save_txt,
        save_crop=args.save_crops,
        show_labels=not args.hide_labels,
        line_width=args.line_width,
        project=str(args.project),
        name=args.name,
        exist_ok=False,  # new folder each run (results, results2, ...) instead of overwriting
        stream=True,
        verbose=False,
    )

    records: list[dict] = []
    started = time.monotonic()
    with console.status("[cyan]Detecting...[/cyan]") as status:
        for result in stream:
            records.append(extract(result))
            status.update(f"[cyan]Processed {len(records)} image(s)/frame(s) · "
                          f"{sum(r['count'] for r in records)} detections[/cyan]")
    elapsed = time.monotonic() - started

    if not records:
        console.print("[yellow]No images were processed. Check the source path or glob.[/yellow]")
        return

    # --- Report ---
    total = sum(r["count"] for r in records)
    with_det = sum(1 for r in records if r["count"])
    confs = [d["confidence"] for r in records for d in r["detections"]]
    inference = [r["speed_ms"].get("inference") for r in records if r["speed_ms"].get("inference") is not None]

    console.print()
    if len(records) <= MAX_DETAIL_IMAGES:
        for r in records:
            show_detail(r)
    else:
        show_summary(records)

    save_dir = Path(getattr(getattr(model, "predictor", None), "save_dir", args.project / args.name))
    save_dir.mkdir(parents=True, exist_ok=True)

    if args.json:
        (save_dir / "detections.json").write_text(json.dumps(records, indent=2), encoding="utf-8")
    if args.csv:
        write_csv(save_dir / "detections.csv", records)

    lines = [
        f"[bold green]Potholes detected: {total}[/bold green]",
        f"Images/frames: {len(records)} ({with_det} with potholes)",
    ]
    if confs:
        lines.append(f"Confidence: mean {sum(confs) / len(confs):.1%} · min {min(confs):.1%} · max {max(confs):.1%}")
    if inference:
        mean_ms = sum(inference) / len(inference)
        lines.append(f"Inference: {mean_ms:.1f} ms/image (≈{1000 / max(mean_ms, 1e-9):.0f} FPS) · "
                     f"wall time {elapsed:.1f}s")
    if args.save or args.json or args.csv or args.save_txt or args.save_crops:
        lines.append(f"\nOutput saved in: {save_dir.resolve()}")
    console.print(Panel("\n".join(lines), border_style="green", box=box.ROUNDED, expand=False))

    if total == 0:
        console.print(f"[dim]Nothing found at conf={args.conf}. Try a lower --conf or --tta.[/dim]")
    elif confs and sum(c < 0.35 for c in confs) / len(confs) > 0.5:
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
