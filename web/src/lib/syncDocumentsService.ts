import { api } from "./api";
import { encryptJson, decryptJson } from "./crypto";
import { getVaultContext } from "./syncVaultService";
import type { Document, DocumentMeta } from "../types";

// Sync-mode counterpart to documentsService.ts, backed by ../../server's
// /api/documents instead of IndexedDB. No isDecoy plumbing needed here - the
// server already scopes rows by the session's (user, isDecoy).

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

function nowMs(): number {
  return Date.now();
}

async function readDoc(record: EncryptedDocRecord, key: Uint8Array): Promise<Document> {
  const payload = await decryptJson<DocPayload>(key, record.nonce, record.ciphertext);
  return { id: record.id, title: payload.title, content: payload.content, updatedAt: payload.updatedAt };
}

export async function listDocuments(): Promise<DocumentMeta[]> {
  const { key } = getVaultContext();
  const records = await api.listDocuments();
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
  const { key } = getVaultContext();
  const payload: DocPayload = { title: "Untitled", content: "", updatedAt: nowMs() };
  const { nonce, ciphertext } = await encryptJson(key, payload);
  const record = await api.createDocument({ nonce, ciphertext });
  return { id: record.id, ...payload };
}

export async function getDocument(id: string): Promise<Document> {
  const { key } = getVaultContext();
  const record = await api.getDocument(id);
  return readDoc(record, key);
}

export async function saveDocument(id: string, title: string, content: string): Promise<number> {
  const { key } = getVaultContext();
  const updatedAt = nowMs();
  const payload: DocPayload = { title, content, updatedAt };
  const { nonce, ciphertext } = await encryptJson(key, payload);
  await api.putDocument(id, { nonce, ciphertext });
  return updatedAt;
}

export async function renameDocument(id: string, title: string): Promise<void> {
  const doc = await getDocument(id);
  await saveDocument(id, title, doc.content);
}

export async function deleteDocument(id: string): Promise<void> {
  await api.deleteDocument(id);
}
