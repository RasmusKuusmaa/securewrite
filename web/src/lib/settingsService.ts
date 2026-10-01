import { getMeta, putMeta } from "./db";

// Mirrors src-tauri/src/settings.rs.
export interface Settings {
  idleTimeoutMinutes: number;
  lockOnBlur: boolean;
  flowPauseSeconds: number;
  flowHardcore: boolean;
  maskOnOpen: boolean;
  maskShortcut: string;
}

const DEFAULT_SETTINGS: Settings = {
  idleTimeoutMinutes: 10,
  lockOnBlur: false,
  flowPauseSeconds: 6,
  flowHardcore: false,
  maskOnOpen: true,
  maskShortcut: "Ctrl+Shift+H",
};

export async function getSettings(): Promise<Settings> {
  const stored = await getMeta<Settings>("settings");
  // Merge so settings saved before a field existed pick up its default.
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await putMeta("settings", settings);
}
