/**
 * Downscale an image preserving aspect ratio so max(width, height) <= maxDim.
 * Avoids 1280x1280 squashing (which distorts pothole area_pct) while shrinking
 * 12 MP / 108 MP phone uploads for fast transfer and ~10 ms YOLO inference.
 */
export async function compressImageAspectFit(
  file: File,
  maxDim = 1280,
  quality = 0.85,
): Promise<File> {
  if (typeof window === "undefined" || !file.type.startsWith("image/")) {
    return file;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const longest = Math.max(width, height);

    if (longest <= maxDim && file.size <= 1_500_000) {
      return file;
    }

    const scale = longest > maxDim ? maxDim / longest : 1;
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, targetW, targetH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) return file;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "anomalias";
    return new File([blob], `${baseName}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
