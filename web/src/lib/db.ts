// Minimal IndexedDB wrapper - the browser-side equivalent of the app-data
// directory Rust's `fs` calls read/write in documents.rs/crypto.rs/settings.rs.
// Object stores: "meta" holds the singleton vault + settings records,
// "documents"/"documents_decoy" hold one encrypted record per note, mirroring
// the two on-disk directories `documents_dir(is_decoy)` picks between, and
// "journal"/"journal_decoy" do the same for journal entries (v2).
const DB_NAME = "private-writer";
const DB_VERSION = 2;

export type RecordStore = "documents" | "documents_decoy" | "journal" | "journal_decoy";
const RECORD_STORES: RecordStore[] = ["documents", "documents_decoy", "journal", "journal_decoy"];

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
      for (const name of RECORD_STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "id" });
        }
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

export async function docStoreGetAll<T>(storeName: RecordStore): Promise<T[]> {
  const db = await openDb();
  const tx = db.transaction(storeName, "readonly");
  return promisify(tx.objectStore(storeName).getAll()) as Promise<T[]>;
}

export async function docStoreGet<T>(storeName: RecordStore, id: string): Promise<T | undefined> {
  const db = await openDb();
  const tx = db.transaction(storeName, "readonly");
  return promisify(tx.objectStore(storeName).get(id)) as Promise<T | undefined>;
}

export async function docStorePut<T extends { id: string }>(
  storeName: RecordStore,
  record: T,
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, "readwrite");
  await promisify(tx.objectStore(storeName).put(record));
}

export async function docStoreDelete(storeName: RecordStore, id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, "readwrite");
  await promisify(tx.objectStore(storeName).delete(id));
}

export async function docStoreClear(storeName: RecordStore): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(storeName, "readwrite");
  await promisify(tx.objectStore(storeName).clear());
}
