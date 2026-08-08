// Guest resume file persistence.
//
// Guest analysis happens on the landing page, but the guest -> new-user
// migration runs on the /onboarding page after sign-in. The File object only
// lives in React refs (lost on navigation), so it must be persisted across
// pages. sessionStorage cannot hold a multi-MB File as base64 reliably, so we
// use IndexedDB, which can store Blobs directly.

const DB_NAME = "resumatch_guest";
const STORE = "files";
const KEY = "guest_resume";

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

export async function saveGuestFile(file: File): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(file, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn("Failed to persist guest file:", e);
  }
}

export async function loadGuestFile(): Promise<File | null> {
  try {
    const db = await openDb();
    const file = await new Promise<File | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as File) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return file;
  } catch (e) {
    console.warn("Failed to load guest file:", e);
    return null;
  }
}

export async function clearGuestFile(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn("Failed to clear guest file:", e);
  }
}
