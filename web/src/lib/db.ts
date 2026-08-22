// Minimal IndexedDB wrapper - the browser-side equivalent of the app-data
// directory Rust's `fs` calls read/write in documents.rs/crypto.rs/settings.rs.
// Object stores: "meta" holds the singleton vault + settings records,
// "documents"/"documents_decoy" hold one encrypted record per note, mirroring
// the two on-disk directories `documents_dir(is_decoy)` picks between.
const DB_NAME = "private-writer";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("documents")) {
        db.createObjectStore("documents", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("documents_decoy")) {
        db.createObjectStore("documents_decoy", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  const tx = db.transaction("meta", "readonly");
  const record = await promisify(tx.objectStore("meta").get(key));
  return record ? (record as { key: string; value: T }).value : undefined;
}

export async function putMeta<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("meta", "readwrite");
  await promisify(tx.objectStore("meta").put({ key, value }));
}

export async function docStoreGetAll<T>(storeName: "documents" | "documents_decoy"): Promise<T[]> {
  const db = await openDb();
  const tx = db.transaction(storeName, "readonly");
  return promisify(tx.objectStore(storeName).getAll()) as Promise<T[]>;
}

export async function docStoreGet<T>(storeName: "documents" | "documents_decoy", id: string): Promise<T | undefined> {
  const db = await openDb();
  const tx = db.transaction(storeName, "readonly");
  return promisify(tx.objectStore(storeName).get(id)) as Promise<T | undefined>;
}

export async function docStorePut<T extends { id: string }>(
  storeName: "documents" | "documents_decoy",
  record: T,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, "readwrite");
  await promisify(tx.objectStore(storeName).put(record));
}

export async function docStoreDelete(storeName: "documents" | "documents_decoy", id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, "readwrite");
  await promisify(tx.objectStore(storeName).delete(id));
}

export async function docStoreClear(storeName: "documents" | "documents_decoy"): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, "readwrite");
  await promisify(tx.objectStore(storeName).clear());
}
