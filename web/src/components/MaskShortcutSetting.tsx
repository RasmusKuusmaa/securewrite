import { useEffect, useState } from "react";
import { useSettings } from "../store/useSettings";
import { eventToShortcut, shortcutProblem } from "../lib/shortcut";

/** Click "Change", press the new combination; Escape cancels. */
export default function MaskShortcutSetting() {
  const maskShortcut = useSettings((s) => s.maskShortcut);
  const update = useSettings((s) => s.update);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    // Capture phase + stopPropagation so the combination being recorded
    // doesn't also trigger whatever it's currently bound to.
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        setError(null);
        return;
      }
      const shortcut = eventToShortcut(e);
      if (!shortcut) return;
      const problem = shortcutProblem(shortcut);
      if (problem) {
        setError(problem);
        return;
      }
      setError(null);
      setRecording(false);
      update({ maskShortcut: shortcut });
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [recording, update]);

  return (
    <div className="settings-shortcut">
      <div className="settings-row">
        <span>Mask / unmask shortcut</span>
        <span className="settings-shortcut-controls">
          <kbd className={recording ? "recording" : ""}>{recording ? "Press keys..." : maskShortcut}</kbd>
          <button type="button" className="secondary-button" onClick={() => { setRecording((r) => !r); setError(null); }}>
            {recording ? "Cancel" : "Change"}
          </button>
        </span>
      </div>
      {error && <span className="auth-error">{error}</span>}
      {!error && maskShortcut !== "Ctrl+Shift+H" && !recording && (
        <button type="button" className="journal-link settings-shortcut-reset" onClick={() => update({ maskShortcut: "Ctrl+Shift+H" })}>
          Reset to Ctrl+Shift+H
        </button>
      )}
    </div>
  );
}
