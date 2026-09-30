import type { JournalEntry } from "../types";

// Shared by journalService.ts (local) and syncJournalService.ts (sync) -
// mirrors normalize() in src-tauri/src/journal.rs so all three backends
// store the same shape.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeEntry(entry: JournalEntry): JournalEntry {
  const activity = entry.activity.trim();
  if (!activity) throw new Error("Activity is required");
  if (!DATE_RE.test(entry.date)) throw new Error("Invalid date");
  const parts = entry.parts
    .map((p) => ({ name: p.name.trim(), minutes: Math.max(0, Math.round(p.minutes)) }))
    .filter((p) => p.name && p.minutes > 0);
  const partsTotal = parts.reduce((sum, p) => sum + p.minutes, 0);
  const minutes = Math.max(Math.max(0, Math.round(entry.minutes)), partsTotal);
  return { ...entry, activity, parts, minutes, note: entry.note ?? "" };
}

/** Assigns id/createdAt on first save and bumps updatedAt, like the Rust side. */
export function stampEntry(entry: JournalEntry): JournalEntry {
  const now = Date.now();
  return {
    ...normalizeEntry(entry),
    id: entry.id || crypto.randomUUID(),
    createdAt: entry.createdAt || now,
    updatedAt: now,
  };
}

export function sortEntries(entries: JournalEntry[]): JournalEntry[] {
  return entries.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}
