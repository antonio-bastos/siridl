#!/usr/bin/env python3
"""
    Prepare a pothole detection dataset in YOLO format.
    python prepare_dataset.py --dry-run                  # scan + report only, write nothing
    python prepare_dataset.py                            # build dataset_yolo/
    python prepare_dataset.py --negatives-ratio 0.15     # add ~15% background (no-pothole) images
    python prepare_dataset.py --source my_dataset --val-ratio 0.15 --polygons-to-boxes
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import random
import re
import shutil
import statistics
import sys
import time
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

if sys.platform == "win32":
    reconfigure = getattr(sys.stdout, "reconfigure", None)
    if callable(reconfigure):
        try:
            reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

import yaml
from PIL import Image, ImageOps
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

console = Console()

# Supervisely classTitle (lower-case) -> YOLO class id
CLASS_MAP = {"pothole": 0}
CLASS_NAMES = {0: "pothole"}

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
COPYABLE_EXTENSIONS = {".jpg", ".jpeg", ".png"}  # copied byte-for-byte (no re-encode)
EXIF_ORIENTATION = 0x0112


# ---------------------------------------------------------
# CLI
# ---------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--source", type=Path, default=Path("dataset"))
    p.add_argument("--output", type=Path, default=Path("dataset_yolo"))
    p.add_argument("--train-groups", nargs="+", default=["ds1_simplex-train", "ds2_complex-train"])
    p.add_argument("--test-groups", nargs="+", default=["ds1_simplex-test", "ds2_complex-test"])
    p.add_argument("--val-ratio", type=float, default=0.10, help="Validation share, split per training group")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--workers", type=int, default=min(8, os.cpu_count() or 4))
    p.add_argument("--min-box-px", type=float, default=2.0, help="Drop boxes narrower/shorter than this")
    p.add_argument("--polygons-to-boxes", action="store_true",
                   help="Also use polygon annotations (converted to their bounding box)")
    p.add_argument("--negatives-ratio", type=float, default=0.0,
                   help="Add background images (no potholes) as a fraction of positive images in train/val")
    p.add_argument("--no-dedupe", dest="dedupe", action="store_false",
                   help="Skip exact-duplicate / train-test leakage detection")
    p.add_argument("--no-clean", dest="clean", action="store_false",
                   help="Keep existing files in the output images/ and labels/ folders")
    p.add_argument("--imgsz", type=int, default=1280, help="Training image size (only used for box-size hints)")
    p.add_argument("--split-by-sequence", action="store_true", default=True,
                   help="Group consecutive camera burst frames together to prevent sequence leakage between train and val")
    p.add_argument("--no-split-by-sequence", dest="split_by_sequence", action="store_false",
                   help="Disable sequence grouping and perform random frame-level shuffling")
    p.add_argument("--dry-run", action="store_true", help="Scan and report without writing anything")
    return p.parse_args()


# ---------------------------------------------------------
# Data structures
# ---------------------------------------------------------

@dataclass
class Sample:
    group: str
    image_path: Path
    rel: Path                    # path relative to the group's img/ folder
    boxes: list                  # [(cls, cx, cy, w, h), ...] normalized; empty = background image
    transpose: bool              # EXIF rotation must be baked in when writing
    digest: str | None = None
    out_stem: str = ""


@dataclass
class ScanResult:
    status: str                  # ok | empty | missing | invalid
    sample: Sample | None = None
    info: Counter = field(default_factory=Counter)
    detail: str = ""


# ---------------------------------------------------------
# Terminal UI
# ---------------------------------------------------------

def show_banner(args: argparse.Namespace) -> None:
    console.print()
    console.print(Panel(
        "[bold cyan]ROAD POTHOLE DETECTION[/bold cyan]\n"
        "[white]Dataset Preparation → YOLO Format[/white]\n"
        "[dim]Convert, deduplicate, split, validate and report[/dim]",
        border_style="cyan", box=box.ROUNDED, expand=False,
    ))
    console.print(f"[dim]Source: {args.source.resolve()}[/dim]")
    console.print(f"[dim]Output: {args.output.resolve()}"
                  f"{'  (dry run: nothing will be written)' if args.dry_run else ''}[/dim]\n")


def make_progress() -> Progress:
    return Progress(
        SpinnerColumn(style="cyan"),
        TextColumn("[bold]{task.description}"),
        BarColumn(bar_width=30, complete_style="green"),
        MofNCompleteColumn(),
        TextColumn("[cyan]{task.percentage:>3.0f}%"),
        TimeElapsedColumn(),
        TextColumn("•"),
        TimeRemainingColumn(),
        console=console,
    )


def show_table(title: str, rows: dict, header: tuple[str, str] = ("Metric", "Count")) -> None:
    table = Table(title=title, box=box.ROUNDED, header_style="bold cyan")
    table.add_column(header[0])
    table.add_column(header[1], justify="right")
    for name, value in rows.items():
        table.add_row(str(name), f"{value:,}" if isinstance(value, int) else str(value))
    console.print(table)


# ---------------------------------------------------------
# Annotation conversion
# ---------------------------------------------------------

def read_annotation(ann: dict, width: int, height: int, args: argparse.Namespace) -> tuple[list, Counter]:
    """Convert Supervisely objects to normalized YOLO boxes. Returns (boxes, notes)."""
    info: Counter = Counter()
    boxes, seen = [], set()

    for obj in ann.get("objects", []):
        title = str(obj.get("classTitle", "")).strip().lower()
        cls = CLASS_MAP.get(title)
        if cls is None:
            info[f"ignored class '{title or '<none>'}'"] += 1
            continue

        geom = obj.get("geometryType")
        pts = (obj.get("points") or {}).get("exterior") or []
        if geom == "rectangle" and len(pts) >= 2:
            pts = pts[:2]
        elif geom == "polygon" and args.polygons_to_boxes and len(pts) >= 3:
            pass
        else:
            info[f"ignored geometry '{geom}'"] += 1
            continue

        xs = [float(p[0]) for p in pts]
        ys = [float(p[1]) for p in pts]
        if min(xs) < 0 or max(xs) > width or min(ys) < 0 or max(ys) > height:
            info["boxes clipped to image bounds"] += 1

        left, right = max(0.0, min(xs)), min(float(width), max(xs))
        top, bottom = max(0.0, min(ys)), min(float(height), max(ys))

        if right - left < args.min_box_px or bottom - top < args.min_box_px:
            info["boxes dropped (degenerate/too small)"] += 1
            continue

        key = (cls, round(left, 1), round(top, 1), round(right, 1), round(bottom, 1))
        if key in seen:
            info["duplicate boxes dropped"] += 1
            continue
        seen.add(key)

        boxes.append((
            cls,
            ((left + right) / 2) / width,
            ((top + bottom) / 2) / height,
            (right - left) / width,
            (bottom - top) / height,
        ))
    return boxes, info


# ---------------------------------------------------------
# Scanning
# ---------------------------------------------------------

def scan_one(image_path: Path, image_dir: Path, ann_dir: Path, group: str, args: argparse.Namespace) -> ScanResult:
    # Annotation files are named "<image filename>.json" (e.g. image.JPG.json), so use .name, not .stem.
    ann_path = ann_dir / f"{image_path.name}.json"
    if not ann_path.is_file():
        return ScanResult("missing", detail="no annotation file")

    try:
        with Image.open(image_path) as im:
            width, height = im.size
            transpose = im.getexif().get(EXIF_ORIENTATION, 1) in (5, 6, 7, 8)
        if transpose:  # OpenCV/Ultralytics will see the rotated image
            width, height = height, width
        if width <= 0 or height <= 0:
            raise ValueError("invalid image dimensions")

        with ann_path.open("r", encoding="utf-8") as f:
            ann = json.load(f)

        # Supervisely stores the annotated image size; a mismatch means boxes would be misplaced.
        size = ann.get("size") or {}
        if size.get("width") and size.get("height"):
            ann_size = (int(size["width"]), int(size["height"]))
            if ann_size != (width, height):
                return ScanResult("invalid", detail=f"annotation size {ann_size} != image size {(width, height)}")

        boxes, info = read_annotation(ann, width, height, args)
        digest = hashlib.blake2b(image_path.read_bytes(), digest_size=16).hexdigest() if args.dedupe else None

    except (OSError, ValueError, TypeError, KeyError, AttributeError) as exc:  # includes JSONDecodeError
        return ScanResult("invalid", detail=str(exc))

    sample = Sample(
        group=group,
        image_path=image_path,
        rel=image_path.relative_to(image_dir),
        boxes=boxes,
        transpose=transpose,
        digest=digest,
    )
    return ScanResult("ok" if boxes else "empty", sample=sample, info=info)


def collect_group(group: str, split: str, executor: ThreadPoolExecutor, args: argparse.Namespace, issues: list):
    image_dir = args.source / group / "img"
    ann_dir = args.source / group / "ann"

    image_paths = sorted(
        p for p in image_dir.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
    )

    console.rule(f"[bold cyan]Scanning {group}[/bold cyan]")
    console.print(f"[dim]Split: {split} | Images found: {len(image_paths):,}[/dim]")

    stats = Counter(images=len(image_paths))
    notes: Counter = Counter()
    samples: list[Sample] = []

    with make_progress() as progress:
        task = progress.add_task(f"[cyan]Scanning {group}", total=len(image_paths))
        # executor.map keeps input order, so results stay deterministic regardless of thread timing.
        results = executor.map(lambda p: scan_one(p, image_dir, ann_dir, group, args), image_paths)
        for path, res in zip(image_paths, results):
            progress.advance(task)
            notes.update(res.info)
            if res.status in ("ok", "empty"):
                sample = res.sample
                assert sample is not None
                if res.status == "ok":
                    stats["labeled"] += 1
                    stats["boxes"] += len(sample.boxes)
                else:
                    stats["no valid boxes (background)"] += 1
                samples.append(sample)
            else:
                stats[res.status] += 1
                issues.append((group, str(path.relative_to(image_dir)), res.status, res.detail))

    show_table(group, dict(stats))
    return samples, stats, notes


# ---------------------------------------------------------
# Dedupe / splitting / naming
# ---------------------------------------------------------

def normalize_stem(stem: str) -> str:
    s = stem.lower()
    for prefix in ("positive_", "negative_"):
        if s.startswith(prefix):
            s = s[len(prefix):]
    return s


def dedupe(train: list[Sample], test: list[Sample]):
    """Drop exact duplicates inside each split, preserving richest annotations, and drop test images that appear in train."""
    seen_train_hash: dict[str, int] = {}
    seen_train_stems: dict[str, int] = {}
    kept_train: list[Sample] = []
    dup_train = 0

    for s in train:
        norm_stem = normalize_stem(s.rel.stem)
        digest = s.digest
        if digest is None:
            raise ValueError("Cannot deduplicate a sample without an image digest")
        if digest in seen_train_hash:
            idx = seen_train_hash[digest]
            # Keep whichever duplicate has more / richer bounding boxes
            if len(s.boxes) > len(kept_train[idx].boxes):
                kept_train[idx] = s
            dup_train += 1
            continue
        seen_train_hash[digest] = len(kept_train)
        seen_train_stems[norm_stem] = len(kept_train)
        kept_train.append(s)

    seen_test_hash: set[str] = set()
    kept_test: list[Sample] = []
    dup_test, leaked = 0, 0

    for s in test:
        norm_stem = normalize_stem(s.rel.stem)
        digest = s.digest
        if digest is None:
            raise ValueError("Cannot deduplicate a sample without an image digest")
        # Check both exact cryptographic byte hash AND normalized image stem (catches recompressed leaks)
        if digest in seen_train_hash or norm_stem in seen_train_stems:
            leaked += 1
        elif digest in seen_test_hash:
            dup_test += 1
        else:
            seen_test_hash.add(digest)
            kept_test.append(s)

    return kept_train, kept_test, {
        "duplicates removed from train": dup_train,
        "duplicates removed from test": dup_test,
        "test images also in train (removed)": leaked,
    }


def extract_frame_num(rel_path: Path) -> int | None:
    m = re.search(r"G(\d{7})", rel_path.name)
    return int(m.group(1)) if m else None


def split_train_val(train_pos: list[Sample], ratio: float, rng: random.Random, split_by_sequence: bool = True):
    """Split each training group separately. When split_by_sequence is True, keeps consecutive bursts together."""
    by_group = defaultdict(list)
    for s in train_pos:
        by_group[s.group].append(s)

    train, val = [], []
    for group in sorted(by_group):
        items = by_group[group][:]
        if not split_by_sequence or len(items) < 10:
            rng.shuffle(items)
            n_val = max(1, round(len(items) * ratio)) if len(items) >= 2 else 0
            val += items[:n_val]
            train += items[n_val:]
            continue

        # Cluster by consecutive frame numbers (gap <= 15 frames) to avoid temporal leakage
        numbered = []
        unnumbered = []
        for s in items:
            n = extract_frame_num(s.rel)
            if n is not None:
                numbered.append((n, s))
            else:
                unnumbered.append(s)
        numbered.sort(key=lambda x: x[0])

        clusters = []
        curr = []
        last_n = None
        for n, s in numbered:
            if last_n is None or (n - last_n <= 15):
                curr.append(s)
            else:
                clusters.append(curr)
                curr = [s]
            last_n = n
        if curr:
            clusters.append(curr)
        for u in unnumbered:
            clusters.append([u])

        rng.shuffle(clusters)
        target_val = max(1, round(len(items) * ratio))
        group_val, group_train = [], []
        curr_val_count = 0

        for c in clusters:
            if curr_val_count < target_val:
                group_val.extend(c)
                curr_val_count += len(c)
            else:
                group_train.extend(c)

        val += group_val
        train += group_train

    return train, val


def add_negatives(pool: list[Sample], train: list[Sample], val: list[Sample], ratio: float, rng: random.Random):
    """Append verified background images, proportionally to positives, to train and val only."""
    if ratio <= 0 or not pool:
        return [], []
    clean_pool = [s for s in pool if not s.rel.name.startswith("positive_")]
    clean_pool = clean_pool[:]
    rng.shuffle(clean_pool)
    total = min(len(clean_pool), round(ratio * (len(train) + len(val))))
    n_val = round(total * len(val) / max(1, len(train) + len(val)))
    return clean_pool[n_val:total], clean_pool[:n_val]


def assign_names(samples: list[Sample]) -> None:
    """Unique, filesystem-safe output names (handles same stem in different folders/extensions)."""
    used: set[str] = set()
    for s in samples:
        base = f"{s.group}__{s.rel.with_suffix('').as_posix().replace('/', '__')}"
        base = re.sub(r"[^\w.\-]+", "_", base)
        stem = base
        if stem.lower() in used:
            stem = f"{base}_{s.rel.suffix.lstrip('.').lower()}"
        n = 2
        while stem.lower() in used:
            stem = f"{base}_{n}"
            n += 1
        used.add(stem.lower())
        s.out_stem = stem


# ---------------------------------------------------------
# Output
# ---------------------------------------------------------

def prepare_output(args: argparse.Namespace) -> None:
    out = args.output
    out.mkdir(parents=True, exist_ok=True)

    if args.clean:
        src = args.source.resolve()
        for directory in (out / "images", out / "labels"):
            d = directory.resolve()
            if d == src or d in src.parents or src in d.parents:
                raise RuntimeError(f"Refusing to clean {d}: it overlaps with the source dataset {src}")
            if directory.exists():
                shutil.rmtree(directory)

    for split in ("train", "val", "test"):
        (out / "images" / split).mkdir(parents=True, exist_ok=True)
        (out / "labels" / split).mkdir(parents=True, exist_ok=True)


def write_one(sample: Sample, split: str, out: Path) -> None:
    image_dir, label_dir = out / "images" / split, out / "labels" / split
    suffix = sample.image_path.suffix.lower()

    if not sample.transpose and suffix in COPYABLE_EXTENSIONS:
        shutil.copyfile(sample.image_path, image_dir / f"{sample.out_stem}{suffix}")  # lossless, fast
    else:
        with Image.open(sample.image_path) as im:
            if sample.transpose:
                im = ImageOps.exif_transpose(im)
            im.convert("RGB").save(image_dir / f"{sample.out_stem}.jpg", format="JPEG", quality=95)

    lines = "".join(f"{c} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}\n" for c, cx, cy, w, h in sample.boxes)
    (label_dir / f"{sample.out_stem}.txt").write_text(lines, encoding="utf-8")  # empty file = background


def write_samples(samples: list[Sample], split: str, executor: ThreadPoolExecutor, out: Path) -> None:
    started = time.monotonic()
    console.rule(f"[bold cyan]Writing {split} dataset[/bold cyan]")

    with make_progress() as progress:
        task = progress.add_task(f"[green]Writing {split}", total=len(samples))
        for _ in executor.map(lambda s: write_one(s, split, out), samples):
            progress.advance(task)

    elapsed = time.monotonic() - started
    boxes = sum(len(s.boxes) for s in samples)
    console.print(f"[green]✓[/green] {split}: {len(samples):,} images, {boxes:,} boxes "
                  f"in {elapsed:.1f}s ({len(samples) / max(elapsed, 1e-9):.1f} images/s)")


def write_yaml(args: argparse.Namespace, has_test: bool) -> Path:
    cfg = {"path": args.output.resolve().as_posix(), "train": "images/train", "val": "images/val"}
    if has_test:
        cfg["test"] = "images/test"
    cfg["names"] = CLASS_NAMES
    path = args.output / "data.yaml"
    path.write_text(yaml.safe_dump(cfg, sort_keys=False, allow_unicode=True), encoding="utf-8")
    return path


# ---------------------------------------------------------
# Verification and reporting
# ---------------------------------------------------------

def verify_output(out: Path, expected: dict[str, tuple[int, int]]) -> list[str]:
    """Re-read what was written: image/label pairing, label syntax, value ranges, counts."""
    errors: list[str] = []
    for split, (n_images, n_boxes) in expected.items():
        if n_images == 0:
            continue
        images = {p.stem for p in (out / "images" / split).iterdir() if p.suffix.lower() in IMAGE_EXTENSIONS}
        labels = {p.stem: p for p in (out / "labels" / split).glob("*.txt")}

        if len(images) != n_images:
            errors.append(f"{split}: expected {n_images} images, found {len(images)}")
        for stem in sorted(images - labels.keys())[:5]:
            errors.append(f"{split}: image without label: {stem}")
        for stem in sorted(labels.keys() - images)[:5]:
            errors.append(f"{split}: label without image: {stem}")

        found_boxes = 0
        for stem, path in labels.items():
            for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                parts = line.split()
                try:
                    cls = int(parts[0])
                    vals = [float(v) for v in parts[1:]]
                    ok = len(parts) == 5 and cls in CLASS_NAMES and all(0 <= v <= 1 for v in vals) \
                        and vals[2] > 0 and vals[3] > 0
                except (ValueError, IndexError):
                    ok = False
                if not ok:
                    errors.append(f"{split}: bad label {path.name}:{n}")
                else:
                    found_boxes += 1
        if found_boxes != n_boxes:
            errors.append(f"{split}: expected {n_boxes} boxes, found {found_boxes}")
    return errors


def show_box_size_hint(train: list[Sample], imgsz: int) -> dict:
    ws = sorted(w for s in train for (_, _, _, w, _) in s.boxes)
    hs = sorted(h for s in train for (_, _, _, _, h) in s.boxes)
    if not ws:
        return {}
    longest = [max(w, h) * imgsz for s in train for (_, _, _, w, h) in s.boxes]
    small16 = sum(v < 16 for v in longest) / len(longest)
    small32 = sum(v < 32 for v in longest) / len(longest)
    stats = {
        "median_width_pct": statistics.median(ws) * 100,
        "median_height_pct": statistics.median(hs) * 100,
        "share_under_16px": small16,
        "share_under_32px": small32,
    }
    show_table(
        f"Box sizes in train (approx. at imgsz={imgsz})",
        {
            "Median box width / height": f"{stats['median_width_pct']:.1f}% / {stats['median_height_pct']:.1f}% of image",
            "Boxes with longest side < 16 px": f"{small16 * 100:.1f}%",
            "Boxes with longest side < 32 px": f"{small32 * 100:.1f}%",
        },
        header=("Statistic", "Value"),
    )
    if small16 > 0.15:
        console.print("[yellow]Many very small boxes: keep a high --imgsz (or consider tiling) when training.[/yellow]")
    return stats


def save_issues(out: Path, issues: list) -> Path | None:
    if not issues:
        return None
    path = out / "skipped_files.csv"
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["group", "image", "reason", "detail"])
        w.writerows(issues)
    return path


# ---------------------------------------------------------
# Main
# ---------------------------------------------------------

def main() -> None:
    args = parse_args()
    started = time.monotonic()
    show_banner(args)

    if not args.source.is_dir():
        raise FileNotFoundError(f"Dataset folder not found: {args.source.resolve()}\nUse --source to point to it.")

    missing = [
        str(args.source / g / sub)
        for g in args.train_groups + args.test_groups
        for sub in ("img", "ann")
        if not (args.source / g / sub).is_dir()
    ]
    if missing:
        raise FileNotFoundError("Expected folders not found:\n  " + "\n  ".join(missing))

    rng = random.Random(args.seed)
    issues: list = []
    notes_total: Counter = Counter()
    train_all: list[Sample] = []
    test_all: list[Sample] = []

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        for group in args.train_groups:
            samples, _, notes = collect_group(group, "train", executor, args, issues)
            train_all += samples
            notes_total.update(notes)
        for group in args.test_groups:
            samples, _, notes = collect_group(group, "test", executor, args, issues)
            test_all += samples
            notes_total.update(notes)

        if notes_total:
            console.print()
            show_table("Annotation notes (all groups)", dict(notes_total), header=("Note", "Count"))

        # Exact duplicates / leakage
        if args.dedupe:
            train_all, test_all, dup_stats = dedupe(train_all, test_all)
            if any(dup_stats.values()):
                console.print()
                show_table("Duplicate check", dup_stats)
                if dup_stats["test images also in train (removed)"]:
                    console.print("[yellow]Some test images were identical to training images and were removed "
                                  "to keep evaluation honest.[/yellow]")

        train_pos = [s for s in train_all if s.boxes]
        train_neg = [s for s in train_all if not s.boxes]
        test_pos = [s for s in test_all if s.boxes]  # test keeps positives only, matching earlier results

        if len(train_pos) < 2:
            console.print("[bold red]Not enough labeled training images.[/bold red]")
            console.print("Check annotation matching, JSON contents and class names "
                          f"(expected classTitle: {', '.join(CLASS_MAP)}).")
            return
        if not test_pos:
            console.print("[yellow]Warning:[/yellow] no labeled test images were found; data.yaml will have no test split.")

        train, val = split_train_val(train_pos, args.val_ratio, rng, split_by_sequence=args.split_by_sequence)
        neg_train, neg_val = add_negatives(train_neg, train, val, args.negatives_ratio, rng)
        n_pos_train, n_pos_val = len(train), len(val)
        train += neg_train
        val += neg_val

        assign_names(train + val + test_pos)

        console.print()
        show_table("Planned Output", {
            "Training images": len(train),
            "  of which background": len(neg_train),
            "Validation images": len(val),
            "  of which background": len(neg_val),
            "Test images": len(test_pos),
            "Total images": len(train) + len(val) + len(test_pos),
            "Training boxes": sum(len(s.boxes) for s in train),
            "Validation boxes": sum(len(s.boxes) for s in val),
            "Test boxes": sum(len(s.boxes) for s in test_pos),
        })
        box_stats = show_box_size_hint(train, args.imgsz)

        if args.dry_run:
            console.print("\n[cyan]Dry run complete. Nothing was written.[/cyan]")
            return

        prepare_output(args)
        write_samples(train, "train", executor, args.output)
        write_samples(val, "val", executor, args.output)
        write_samples(test_pos, "test", executor, args.output)

    yaml_path = write_yaml(args, has_test=bool(test_pos))

    # Verify what is actually on disk
    console.print()
    console.rule("[bold cyan]Verifying output[/bold cyan]")
    errors = verify_output(args.output, {
        "train": (len(train), sum(len(s.boxes) for s in train)),
        "val": (len(val), sum(len(s.boxes) for s in val)),
        "test": (len(test_pos), sum(len(s.boxes) for s in test_pos)),
    })
    if errors:
        console.print(f"[bold red]{len(errors)} problem(s) found:[/bold red]")
        for e in errors[:20]:
            console.print(f"  [red]•[/red] {e}")
    else:
        console.print("[green]✓[/green] Every image has a matching, valid label file; counts match the plan.")

    skipped_csv = save_issues(args.output, issues)
    elapsed = time.monotonic() - started

    report = {
        "args": {k: str(v) for k, v in vars(args).items()},
        "counts": {
            "train": len(train), "train_background": len(neg_train),
            "val": len(val), "val_background": len(neg_val), "test": len(test_pos),
            "train_positive": n_pos_train, "val_positive": n_pos_val,
        },
        "annotation_notes": dict(notes_total),
        "box_stats_train": box_stats,
        "skipped_files": len(issues),
        "verification_errors": errors,
        "seconds": round(elapsed, 1),
    }
    (args.output / "dataset_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")

    console.print()
    console.print(Panel(
        f"[bold {'red' if errors else 'green'}]DATASET PREPARATION "
        f"{'FINISHED WITH ERRORS' if errors else 'COMPLETE'}[/bold {'red' if errors else 'green'}]\n\n"
        f"Training:   {len(train):,} images\n"
        f"Validation: {len(val):,} images\n"
        f"Test:       {len(test_pos):,} images\n\n"
        f"Skipped files: {len(issues):,}" + (f"  (see {skipped_csv})" if skipped_csv else "") + "\n"
        f"Total time: {elapsed:.1f} s\n"
        f"YOLO config: {yaml_path}\n"
        f"Report: {args.output / 'dataset_report.json'}",
        border_style="red" if errors else "green", box=box.ROUNDED, expand=False,
    ))
    console.print("[dim]Review the counts and notes above before starting model training.[/dim]")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        console.print("\n[yellow]Cancelled by user.[/yellow]")
        raise SystemExit(130)
    except Exception as exc:
        console.print(f"\n[bold red]ERROR:[/bold red] {exc}")
        raise
