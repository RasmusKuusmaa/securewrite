import { getMeta, putMeta } from "./db";

// Mirrors src-tauri/src/settings.rs.
export interface Settings {
  idleTimeoutMinutes: number;
  lockOnBlur: boolean;
  flowPauseSeconds: number;
  flowHardcore: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  idleTimeoutMinutes: 10,
  lockOnBlur: false,
  flowPauseSeconds: 6,
  flowHardcore: false,
};

export async function getSettings(): Promise<Settings> {
  const stored = await getMeta<Settings>("settings");
  return stored ?? DEFAULT_SETTINGS;
}

export async function saveSettings(settings: Settings): Promise<void> {
  await putMeta("settings", settings);
}
