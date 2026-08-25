import { create } from "zustand";

export type BackendMode = "local" | "sync";

const STORAGE_KEY = "pw-backend-mode";

function readPersisted(): BackendMode | null {
  const value = localStorage.getItem(STORAGE_KEY);
  return value === "local" || value === "sync" ? value : null;
}

interface BackendModeState {
  // null = undecided (first launch) - App shows ModeSelect until this is set.
  mode: BackendMode | null;
  choose: (mode: BackendMode) => void;
  // Escape hatch back to the picker, reachable from both auth flows, so a
  // wrong choice (or wanting the other mode later) isn't a dead end.
  reset: () => void;
}

export const useBackendMode = create<BackendModeState>((set) => ({
  mode: readPersisted(),

  choose: (mode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    set({ mode });
  },

  reset: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ mode: null });
  },
}));
