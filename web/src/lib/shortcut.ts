// Keyboard shortcuts stored as display strings like "Ctrl+Shift+H", so the
// settings file stays human-readable and the same string is shown in the UI.

const MODIFIERS = ["Ctrl", "Alt", "Shift", "Meta"] as const;
const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta", "AltGraph", "OS"]);

/** Already bound elsewhere in the app - never allowed as the mask shortcut. */
export const RESERVED_SHORTCUTS = ["Ctrl+Shift+L", "Ctrl+F", "Ctrl+Z", "Ctrl+Y", "Ctrl+C", "Ctrl+V", "Ctrl+X", "Ctrl+A"];

/** Layout-independent key name: letters/digits from e.code, else e.key. */
function keyName(e: KeyboardEvent): string {
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
  if (/^Digit\d$/.test(e.code)) return e.code.slice(5);
  if (e.key === " ") return "Space";
  return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}

/** The shortcut an event represents, or null while only modifiers are held. */
export function eventToShortcut(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Meta");
  parts.push(keyName(e));
  return parts.join("+");
}

export function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  return !!shortcut && eventToShortcut(e)?.toLowerCase() === shortcut.toLowerCase();
}

/** Why a recorded shortcut can't be used, or null if it's fine. A plain key
 * (or Shift+key) would fire while typing, so a real modifier or F-key is needed. */
export function shortcutProblem(shortcut: string): string | null {
  const parts = shortcut.split("+");
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  const isFKey = /^F\d{1,2}$/.test(key);
  if (!isFKey && !mods.some((m) => m === "Ctrl" || m === "Alt" || m === "Meta")) {
    return "Use Ctrl, Alt or Meta (or an F-key) so it can't fire while typing";
  }
  if (RESERVED_SHORTCUTS.some((r) => r.toLowerCase() === shortcut.toLowerCase())) {
    return `${shortcut} is already used by the app`;
  }
  if (!mods.every((m) => (MODIFIERS as readonly string[]).includes(m))) return "Unsupported modifier";
  return null;
}
