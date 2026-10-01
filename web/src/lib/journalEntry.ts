import type { JournalEntry } from "../types";

// Shared by journalService.ts (local) and syncJournalService.ts (sync) -
// mirrors normalize() in src-tauri/src/journal.rs so all three backends
// store the same shape.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeEntry(entry: JournalEntry): JournalEntry {
  if (!DATE_RE.test(entry.date)) throw new Error("Invalid date");
  const title = (entry.title ?? "").trim();
  const note = entry.note ?? "";
  if (entry.kind === "note") {
    if (!title && !note.trim()) throw new Error("Write something first");
    return { ...entry, kind: "note", title, note, activity: "", minutes: 0, parts: [] };
  }
  const activity = (entry.activity ?? "").trim();
  if (!activity) throw new Error("Activity is required");
  const parts = entry.parts
    .map((p) => ({ name: p.name.trim(), minutes: Math.max(0, Math.round(p.minutes)) }))
    .filter((p) => p.name && p.minutes > 0);
  const partsTotal = parts.reduce((sum, p) => sum + p.minutes, 0);
  const minutes = Math.max(Math.max(0, Math.round(entry.minutes)), partsTotal);
  return { ...entry, kind: "time", title, activity, parts, minutes, note };
}

/** Entries saved before notes existed have no kind/title. */
export function upgradeEntry(entry: JournalEntry): JournalEntry {
  return { ...entry, kind: entry.kind ?? "time", title: entry.title ?? "", parts: entry.parts ?? [] };
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
