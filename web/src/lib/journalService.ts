import { docStoreGetAll, docStorePut, docStoreDelete } from "./db";
import { encryptJson, decryptJson } from "./crypto";
import { getVaultContext } from "./vaultService";
import { stampEntry, sortEntries, upgradeEntry } from "./journalEntry";
import type { JournalEntry } from "../types";

// Mirrors src-tauri/src/journal.rs - one encrypted IndexedDB record per
// entry, only the random id left in plaintext.

interface EncryptedEntryRecord {
  id: string;
  nonce: string;
  ciphertext: string;
}

function storeFor(isDecoy: boolean): "journal" | "journal_decoy" {
  return isDecoy ? "journal_decoy" : "journal";
}

export async function listJournalEntries(): Promise<JournalEntry[]> {
  const { key, isDecoy } = getVaultContext();
  const records = await docStoreGetAll<EncryptedEntryRecord>(storeFor(isDecoy));
  const entries: JournalEntry[] = [];
  for (const record of records) {
    try {
      const entry = await decryptJson<JournalEntry>(key, record.nonce, record.ciphertext);
      entries.push(upgradeEntry({ ...entry, id: record.id }));
    } catch {
      // skip records that fail to decrypt rather than crash the whole list
    }
  }
  return sortEntries(entries);
}

export async function saveJournalEntry(entry: JournalEntry): Promise<JournalEntry> {
  const { key, isDecoy } = getVaultContext();
  const saved = stampEntry(entry);
  const { nonce, ciphertext } = await encryptJson(key, saved);
  await docStorePut(storeFor(isDecoy), { id: saved.id, nonce, ciphertext });
  return saved;
}

export async function deleteJournalEntry(id: string): Promise<void> {
  const { isDecoy } = getVaultContext();
  await docStoreDelete(storeFor(isDecoy), id);
}
