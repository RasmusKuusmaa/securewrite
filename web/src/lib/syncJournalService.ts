import { api } from "./api";
import { encryptJson, decryptJson } from "./crypto";
import { getVaultContext } from "./syncVaultService";
import { stampEntry, sortEntries, upgradeEntry } from "./journalEntry";
import type { JournalEntry } from "../types";

// Sync-mode counterpart to journalService.ts, backed by ../../server's
// /api/journal. The server scopes rows by the session's (user, isDecoy).

export async function listJournalEntries(): Promise<JournalEntry[]> {
  const { key } = getVaultContext();
  const records = await api.listJournal();
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
  const { key } = getVaultContext();
  const saved = stampEntry(entry);
  const { nonce, ciphertext } = await encryptJson(key, saved);
  await api.putJournalEntry(saved.id, { nonce, ciphertext });
  return saved;
}

export async function deleteJournalEntry(id: string): Promise<void> {
  await api.deleteJournalEntry(id);
}
