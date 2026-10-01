import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

interface Settings {
  idleTimeoutMinutes: number;
  lockOnBlur: boolean;
  flowPauseSeconds: number;
  flowHardcore: boolean;
  maskOnOpen: boolean;
  maskShortcut: string;
}

interface SettingsState extends Settings {
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<Settings>) => Promise<void>;
}

export const useSettings = create<SettingsState>((set, get) => ({
  idleTimeoutMinutes: 10,
  lockOnBlur: false,
  flowPauseSeconds: 6,
  flowHardcore: false,
  maskOnOpen: true,
  maskShortcut: "Ctrl+Shift+H",
  loaded: false,

  load: async () => {
    const settings = await invoke<Settings>("get_settings");
    set({ ...settings, loaded: true });
  },

  update: async (patch: Partial<Settings>) => {
    const { idleTimeoutMinutes, lockOnBlur, flowPauseSeconds, flowHardcore, maskOnOpen, maskShortcut } = get();
    const next: Settings = {
      idleTimeoutMinutes,
      lockOnBlur,
      flowPauseSeconds,
      flowHardcore,
      maskOnOpen,
      maskShortcut,
      ...patch,
    };
    await invoke("save_settings", { settings: next });
    set(next);
  },
}));
