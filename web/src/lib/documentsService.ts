import { docStoreGetAll, docStoreGet, docStorePut, docStoreDelete } from "./db";
import { encryptJson, decryptJson } from "./crypto";
import { getVaultContext } from "./vaultService";

// Mirrors src-tauri/src/documents.rs - same shape, same "encrypt everything
// but the random id" rationale, just against IndexedDB records instead of
// one JSON file per document on disk.

export interface Document {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}

export interface DocumentMeta {
  id: string;
  title: string;
  updatedAt: number;
}

interface DocPayload {
  title: string;
  content: string;
  updatedAt: number;
}

interface EncryptedDocRecord {
  id: string;
  nonce: string;
  ciphertext: string;
}

function storeFor(isDecoy: boolean): "documents" | "documents_decoy" {
  return isDecoy ? "documents_decoy" : "documents";
}

function nowMs(): number {
  return Date.now();
}

async function readDoc(record: EncryptedDocRecord, key: Uint8Array): Promise<Document> {
  const payload = await decryptJson<DocPayload>(key, record.nonce, record.ciphertext);
  return { id: record.id, title: payload.title, content: payload.content, updatedAt: payload.updatedAt };
}

async function writeDoc(isDecoy: boolean, key: Uint8Array, doc: Document): Promise<void> {
  const payload: DocPayload = { title: doc.title, content: doc.content, updatedAt: doc.updatedAt };
  const { nonce, ciphertext } = await encryptJson(key, payload);
  await docStorePut(storeFor(isDecoy), { id: doc.id, nonce, ciphertext });
}

export async function listDocuments(): Promise<DocumentMeta[]> {
  const { key, isDecoy } = getVaultContext();
  const records = await docStoreGetAll<EncryptedDocRecord>(storeFor(isDecoy));
  const metas: DocumentMeta[] = [];
  for (const record of records) {
    try {
      const doc = await readDoc(record, key);
      metas.push({ id: doc.id, title: doc.title, updatedAt: doc.updatedAt });
    } catch {
      // skip records that fail to decrypt rather than crash the whole list
    }
  }
  metas.sort((a, b) => b.updatedAt - a.updatedAt);
  return metas;
}

export async function createDocument(): Promise<Document> {
  const { key, isDecoy } = getVaultContext();
  const doc: Document = {
    id: crypto.randomUUID(),
    title: "Untitled",
    content: "",
    updatedAt: nowMs(),
  };
  await writeDoc(isDecoy, key, doc);
  return doc;
}

export async function getDocument(id: string): Promise<Document> {
  const { key, isDecoy } = getVaultContext();
  const record = await docStoreGet<EncryptedDocRecord>(storeFor(isDecoy), id);
  if (!record) throw new Error("Document not found");
  return readDoc(record, key);
}

export async function saveDocument(id: string, title: string, content: string): Promise<number> {
  const { key, isDecoy } = getVaultContext();
  const updatedAt = nowMs();
  await writeDoc(isDecoy, key, { id, title, content, updatedAt });
  return updatedAt;
}

export async function renameDocument(id: string, title: string): Promise<void> {
  const { key, isDecoy } = getVaultContext();
  const record = await docStoreGet<EncryptedDocRecord>(storeFor(isDecoy), id);
  if (!record) throw new Error("Document not found");
  const doc = await readDoc(record, key);
  doc.title = title;
  doc.updatedAt = nowMs();
  await writeDoc(isDecoy, key, doc);
}

export async function deleteDocument(id: string): Promise<void> {
  const { isDecoy } = getVaultContext();
  await docStoreDelete(storeFor(isDecoy), id);
}
