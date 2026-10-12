# Dataset Audit & Data Quality Findings

This document summarizes the comprehensive data audit performed on the Road Pothole Detection dataset (`dataset/`), detailing the root causes of removed images, annotation discrepancies, and data leakage patterns.

---

## 1. Deduplication Breakdown

During preprocessing, the deduplication engine in `prepare_dataset.py` removed **2,852 training images** and **93 test images**.

### Method
Deduplication is performed using a **cryptographic BLAKE2b hash** (`hashlib.blake2b(image_path.read_bytes(), digest_size=16)`).
* **Exact match only:** Images were dropped only if their raw bytes were 100% identical.
* **No perceptual loss:** Distinct or visually similar road scenes were **never** dropped by the deduplicator.

### Exact Source of Duplicates
| Split | Removals | Root Cause |
| :--- | :--- | :--- |
| **Train** | **2,852** | **2,845** images in `ds2_complex-train` are identical copies of images in `ds1_simplex-train`; **7** are internal duplicates within `ds2_complex-train`. |
| **Test** | **93** | **93** images in `ds2_complex-test` are identical copies of images in `ds1_simplex-test`. |
| **Train-Test Leakage** | **301** | **292** test images were byte-identical to training images, and **9** images (`G0029008`, `G0063914`, etc.) were identical camera shots with slight JPEG recompression/metadata variations that bypassed byte-level hashing. |

### Critical Ingestion Priority Bug (Resolved)
Because `ds1_simplex-train` was scanned before `ds2_complex-train`:
* In 51 instances, annotations on identical images differed.
* In `negative_G0029868.JPG`, `ds1` contained 0 annotations while `ds2` had 1 valid pothole bounding box.
* The original script kept the first file encountered, inadvertently discarding the valid pothole box and treating the image as background.
* **Fix applied:** Deduplication now compares annotation counts across duplicates and always preserves the sample with the richest annotations.

---

## 2. Missing Annotations & Negative Samples

Across the training datasets, **8,551 images contain 0 bounding boxes** (2,366 in `ds1`, 6,185 in `ds2`).

### Why So Many Zero-Box Images Exist
The raw DatasetNinja dataset segregates road drives into:
1. `positive_G...`: Roads with tagged potholes.
2. `negative_G...`: Plain road surfaces tagged `"negative data"`.

### Quality Audit of the Negative Pool
Running model inference (`runs/detect/runs/pothole/baseline/weights/best.pt`) on a sample of 200 unlabeled negative images revealed:
* **~94%** are genuinely pothole-free road surfaces (clean asphalt, road paint, highway).
* **~6% (12 / 200)** contain high-confidence potholes that were missed by annotators (e.g., `negative_G0026870.JPG` at confidence 0.744, `negative_G0041232.JPG` at confidence 0.714).
* In addition, 49 images in `ds1` and 8 images in `ds2` prefixed `negative_G...` actually had pothole annotations present in their JSON files.

### Guidelines for Training with Negatives
> [!CAUTION]
> **Do not blindly train on raw negative images.**
> An empty YOLO label file penalizes any box predicted on the image. If ~6% of background images contain unlabeled potholes, the loss function penalizes the model for correctly detecting potholes, degrading true-positive recall.

* **Best Practice:** Keep `--negatives-ratio 0.05` to `0.10`, but filter the negative candidate pool so images with high-confidence detections are either pseudo-labeled or excluded from the background set.

---

## 3. Data Leakage & Sequence-Aware Splitting

### The Video Burst Problem
The dataset was collected via vehicle-mounted cameras recording continuous bursts (e.g., `G0214943.JPG`, `G0214944.JPG`, `G0214945.JPG` taken fractions of a second apart).

```
[Continuous Camera Drive]
  ├── Frame G0214943 (assigned to Train)
  ├── Frame G0214944 (assigned to Val)    <-- Identical road scene, lighting, angle!
  └── Frame G0214945 (assigned to Train)
```

* **Previous Behavior:** `prepare_dataset.py` performed an image-level random shuffle (`rng.shuffle(items)`). Adjacent frames of the same road pothole were split between `train` and `val`, artificially inflating validation mAP (~0.63 mAP50) due to scene memorization.
* **Test Leakage:** Over 61% of raw test images were within 5 frames of a training image from the same vehicle trip.

### Sequence-Aware Solution
`prepare_dataset.py` now groups consecutive frame numbers ($\Delta \le 15$ frames) into unified trip clusters (`--split-by-sequence`):
1. Entire bursts are assigned as atomic units to either `train` or `val`.
2. Validation reflects true out-of-sample generalization to new roads.
3. Test sets are purged of both byte-level duplicates and recompressed duplicate shots.
