import { create } from "zustand";
import { invoke } from "../lib/backend";
import type { JournalEntry } from "../types";
import { defaultFilter, type JournalFilter } from "../lib/journal";
import { useDocuments } from "./useDocuments";

export type AppView = "documents" | "journal";
export type JournalTab = "log" | "calendar" | "stats";

interface JournalState {
  view: AppView;
  tab: JournalTab;
  entries: JournalEntry[];
  loaded: boolean;
  filter: JournalFilter;
  setView: (view: AppView) => Promise<void>;
  setTab: (tab: JournalTab) => void;
  setFilter: (patch: Partial<JournalFilter>) => void;
  resetFilter: () => void;
  load: () => Promise<void>;
  save: (entry: JournalEntry) => Promise<JournalEntry>;
  remove: (id: string) => Promise<void>;
  reset: () => void;
}

/** Newest day first, but within a day in the order things were logged. */
function sorted(entries: JournalEntry[]): JournalEntry[] {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date) || a.createdAt - b.createdAt);
}

let loadPromise: Promise<void> | null = null;

export const useJournal = create<JournalState>((set, get) => ({
  view: "documents",
  tab: "log",
  entries: [],
  loaded: false,
  filter: defaultFilter(),

  setView: async (view) => {
    // Leaving the editor unmounts it, which cancels its pending autosave
    // timer - flush first so switching views never drops keystrokes.
    if (get().view === "documents" && view !== "documents") {
      await useDocuments.getState().saveActive();
    }
    set({ view });
  },

  setTab: (tab) => set({ tab }),
  setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
  resetFilter: () => set({ filter: defaultFilter() }),

  // Guarded like useDocuments.init against StrictMode's double mount.
  load: () => {
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      try {
        const entries = await invoke<JournalEntry[]>("list_journal_entries");
        set({ entries: sorted(entries), loaded: true });
      } catch (err) {
        loadPromise = null;
        throw err;
      }
    })();
    return loadPromise;
  },

  save: async (entry) => {
    const saved = await invoke<JournalEntry>("save_journal_entry", { entry });
    set((s) => ({ entries: sorted([...s.entries.filter((e) => e.id !== saved.id), saved]) }));
    return saved;
  },

  remove: async (id) => {
    await invoke("delete_journal_entry", { id });
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
  },

  // Called on lock: drop decrypted entries from JS memory.
  reset: () => {
    loadPromise = null;
    set({ view: "documents", tab: "log", entries: [], loaded: false, filter: defaultFilter() });
  },
}));
