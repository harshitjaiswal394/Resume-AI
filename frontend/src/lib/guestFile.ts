// Guest resume file persistence.
//
// Guest analysis happens on the landing page, but the guest -> new-user
// migration runs on the /onboarding page after sign-in. The File object only
// lives in React refs (lost on navigation), so it must be persisted across
// pages. sessionStorage cannot hold a multi-MB File as base64 reliably, so we
// use IndexedDB.
//
// IMPORTANT: we store the raw bytes (ArrayBuffer) + metadata, not the File
// object itself. Storing a File and reading it back can yield a detached
// File whose blob content is empty (storage-js then sends a FormData with no
// file part and the server replies "No content provided"). Persisting the
// bytes and rebuilding `new File([bytes], ...)` guarantees the upload always
// carries real content.

const DB_NAME = "resumatch_guest";
const STORE = "files";
const KEY = "guest_resume";

interface StoredGuestFile {
  name: string;
  type: string;
  lastModified: number;
  bytes: ArrayBuffer;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function storeGet<T>(db: IDBDatabase, key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error);
  });
}

function storePut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function storeDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveGuestFile(file: File): Promise<void> {
  try {
    const bytes = await file.arrayBuffer();
    const payload: StoredGuestFile = {
      name: file.name,
      type: file.type,
      lastModified: file.lastModified,
      bytes,
    };
    const db = await openDb();
    await storePut(db, KEY, payload);
    db.close();
  } catch (e) {
    console.warn("Failed to persist guest file:", e);
  }
}

export async function loadGuestFile(): Promise<File | null> {
  try {
    const db = await openDb();
    const stored = await storeGet<StoredGuestFile | File>(db, KEY);
    db.close();

    // Legacy format: the raw File object was stored. Re-read its bytes so the
    // rebuilt File is guaranteed to carry real content.
    if (stored && !(stored as StoredGuestFile).bytes && stored instanceof Blob) {
      const legacy = stored as File;
      if (legacy.size === 0) return null;
      const bytes = await legacy.arrayBuffer();
      return new File([bytes], legacy.name || "resume", {
        type: legacy.type || "application/octet-stream",
        lastModified: legacy.lastModified,
      });
    }

    const typed = stored as StoredGuestFile | null;
    if (!typed || !typed.bytes || typed.bytes.byteLength === 0) {
      return null;
    }
    return new File([typed.bytes], typed.name || "resume", {
      type: typed.type || "application/octet-stream",
      lastModified: typed.lastModified,
    });
  } catch (e) {
    console.warn("Failed to load guest file:", e);
    return null;
  }
}

export async function clearGuestFile(): Promise<void> {
  try {
    const db = await openDb();
    await storeDelete(db, KEY);
    db.close();
  } catch (e) {
    console.warn("Failed to clear guest file:", e);
  }
}
