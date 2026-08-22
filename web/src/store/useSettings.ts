import { create } from "zustand";
import { invoke } from "../lib/invoke";

interface Settings {
  idleTimeoutMinutes: number;
  lockOnBlur: boolean;
  flowPauseSeconds: number;
  flowHardcore: boolean;
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
  loaded: false,

  load: async () => {
    const settings = await invoke<Settings>("get_settings");
    set({ ...settings, loaded: true });
  },

  update: async (patch: Partial<Settings>) => {
    const { idleTimeoutMinutes, lockOnBlur, flowPauseSeconds, flowHardcore } = get();
    const next: Settings = {
      idleTimeoutMinutes,
      lockOnBlur,
      flowPauseSeconds,
      flowHardcore,
      ...patch,
    };
    await invoke("save_settings", { settings: next });
    set(next);
  },
}));
