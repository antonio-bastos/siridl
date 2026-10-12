
from pathlib import Path

SOURCE = Path("dataset")

for group in [
    "ds1_simplex-train",
    "ds2_complex-train",
    "ds1_simplex-test",
    "ds2_complex-test",
]:
    folder = SOURCE / group

    print(f"\n--- {group} ---")

    if not folder.exists():
        print("GROUP FOLDER NOT FOUND:", folder.resolve())
        continue

    for subfolder in ["img", "ann"]:
        path = folder / subfolder
        print(f"\n{subfolder} exists: {path.exists()}")

        if path.exists():
            files = [p for p in path.rglob("*") if p.is_file()]
            print("File count:", len(files))

            for file in files[:8]:
                print(" ", file.relative_to(SOURCE))
