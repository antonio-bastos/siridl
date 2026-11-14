export interface ExifGpsCoords {
  lat: number;
  lng: number;
}

function readUint16(view: DataView, offset: number, littleEndian: boolean): number {
  return view.getUint16(offset, littleEndian);
}

function readUint32(view: DataView, offset: number, littleEndian: boolean): number {
  return view.getUint32(offset, littleEndian);
}

function readAscii(view: DataView, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    const code = view.getUint8(offset + i);
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out;
}

function readRationalTriple(
  view: DataView,
  offset: number,
  littleEndian: boolean,
): number | null {
  if (offset + 24 > view.byteLength) return null;
  const dNum = readUint32(view, offset, littleEndian);
  const dDen = readUint32(view, offset + 4, littleEndian);
  const mNum = readUint32(view, offset + 8, littleEndian);
  const mDen = readUint32(view, offset + 12, littleEndian);
  const sNum = readUint32(view, offset + 16, littleEndian);
  const sDen = readUint32(view, offset + 20, littleEndian);

  if (!dDen || !mDen || !sDen) return null;
  const deg = dNum / dDen;
  const min = mNum / mDen;
  const sec = sNum / sDen;
  return deg + min / 60 + sec / 3600;
}

function readInlineString(view: DataView, entryOffset: number, count: number): string {
  if (count <= 4) {
    return readAscii(view, entryOffset + 8, count);
  }
  return "";
}

/**
 * Extract GPS coordinates from a JPEG file's EXIF APP1 segment without external dependencies.
 */
export async function extractExifGpsFromFile(file: File): Promise<ExifGpsCoords | null> {
  try {
    const slice = await file.slice(0, 262144).arrayBuffer();
    const view = new DataView(slice);
    if (view.byteLength < 12 || view.getUint16(0, false) !== 0xffd8) {
      return null;
    }

    let offset = 2;
    while (offset + 4 < view.byteLength) {
      const marker = view.getUint16(offset, false);
      offset += 2;
      if (marker === 0xffe1) {
        const length = view.getUint16(offset, false);
        const header = readAscii(view, offset + 2, 6);
        if (header === "Exif") {
          const tiffStart = offset + 8;
          if (tiffStart + 8 > view.byteLength) return null;
          const byteOrder = readAscii(view, tiffStart, 2);
          const littleEndian = byteOrder === "II";
          if (!littleEndian && byteOrder !== "MM") return null;

          const ifd0Rel = readUint32(view, tiffStart + 4, littleEndian);
          const ifd0Offset = tiffStart + ifd0Rel;
          if (ifd0Offset + 2 > view.byteLength) return null;

          const entries = readUint16(view, ifd0Offset, littleEndian);
          let gpsIfdRel: number | null = null;
          for (let i = 0; i < entries; i += 1) {
            const entryOffset = ifd0Offset + 2 + i * 12;
            if (entryOffset + 12 > view.byteLength) break;
            const tag = readUint16(view, entryOffset, littleEndian);
            if (tag === 0x8825) {
              gpsIfdRel = readUint32(view, entryOffset + 8, littleEndian);
              break;
            }
          }

          if (gpsIfdRel === null) return null;
          const gpsIfdOffset = tiffStart + gpsIfdRel;
          if (gpsIfdOffset + 2 > view.byteLength) return null;

          const gpsEntries = readUint16(view, gpsIfdOffset, littleEndian);
          let latRef = "N";
          let lngRef = "E";
          let latVal: number | null = null;
          let lngVal: number | null = null;

          for (let i = 0; i < gpsEntries; i += 1) {
            const entryOffset = gpsIfdOffset + 2 + i * 12;
            if (entryOffset + 12 > view.byteLength) break;
            const tag = readUint16(view, entryOffset, littleEndian);
            const count = readUint32(view, entryOffset + 4, littleEndian);
            const valueOffset = readUint32(view, entryOffset + 8, littleEndian);

            if (tag === 0x0001) {
              latRef = readInlineString(view, entryOffset, count) || "N";
            } else if (tag === 0x0002) {
              latVal = readRationalTriple(view, tiffStart + valueOffset, littleEndian);
            } else if (tag === 0x0003) {
              lngRef = readInlineString(view, entryOffset, count) || "E";
            } else if (tag === 0x0004) {
              lngVal = readRationalTriple(view, tiffStart + valueOffset, littleEndian);
            }
          }

          if (latVal !== null && lngVal !== null) {
            const lat = latRef.toUpperCase() === "S" ? -latVal : latVal;
            const lng = lngRef.toUpperCase() === "W" ? -lngVal : lngVal;
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
            }
          }
          return null;
        }
        offset += length;
      } else if ((marker & 0xff00) !== 0xff00) {
        break;
      } else {
        const segLen = view.getUint16(offset, false);
        offset += segLen;
      }
    }
  } catch {
    return null;
  }
  return null;
}
