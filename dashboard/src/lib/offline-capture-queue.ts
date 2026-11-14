export interface OfflineCaptureItem {
  id: string;
  blob: Blob;
  telemetryJson: string;
  createdAt: number;
}

const DB_NAME = "siri-dl-capture-queue";
const STORE_NAME = "frames";
const DB_VERSION = 1;

function openCaptureDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

export async function enqueueOfflineFrame(item: OfflineCaptureItem): Promise<void> {
  const db = await openCaptureDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB write failed"));
  });
  db.close();
}

export async function getOfflineQueueCount(): Promise<number> {
  try {
    const db = await openCaptureDb();
    const count = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB count failed"));
    });
    db.close();
    return count;
  } catch {
    return 0;
  }
}

export async function flushOfflineQueue(
  sender: (blob: Blob, telemetryJson: string) => Promise<boolean>,
): Promise<{ flushed: number; remaining: number }> {
  const db = await openCaptureDb();
  const items = await new Promise<OfflineCaptureItem[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result as OfflineCaptureItem[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB read failed"));
  });

  items.sort((a, b) => a.createdAt - b.createdAt);
  let flushed = 0;

  for (const item of items) {
    const ok = await sender(item.blob, item.telemetryJson);
    if (!ok) break;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(item.id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB delete failed"));
    });
    flushed += 1;
  }

  db.close();
  const remaining = Math.max(0, items.length - flushed);
  return { flushed, remaining };
}
