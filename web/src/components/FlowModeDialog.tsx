import { useEffect, useState } from "react";
import { useSettings } from "../store/useSettings";

interface FlowModeDialogProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export default function FlowModeDialog({ onConfirm, onCancel }: FlowModeDialogProps) {
  const flowPauseSeconds = useSettings((s) => s.flowPauseSeconds);
  const flowHardcore = useSettings((s) => s.flowHardcore);
  const update = useSettings((s) => s.update);

  const [pauseSeconds, setPauseSeconds] = useState(flowPauseSeconds);
  const [hardcore, setHardcore] = useState(flowHardcore);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  const handleConfirm = async () => {
    await update({ flowPauseSeconds: pauseSeconds, flowHardcore: hardcore });
    onConfirm();
  };

  return (
    <div className="settings-overlay" onClick={onCancel}>
      <div className="settings-panel flow-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span>Flow-writing mode</span>
        </div>
        <p className="auth-subtitle">
          If you stop typing for longer than the pause threshold below, the text you've written
          <strong> since turning this on</strong> is permanently wiped. This is the point of the
          mode, not a bug — nothing is recoverable once it's wiped. Text you already saved before
          enabling this stays untouched.
        </p>

        <label className="settings-row">
          <span>Pause threshold (seconds)</span>
          <input
            type="number"
            min={2}
            max={60}
            value={pauseSeconds}
            onChange={(e) => setPauseSeconds(Math.max(2, Math.min(60, Number(e.target.value) || 2)))}
          />
        </label>

        <label className="settings-row settings-row-checkbox">
          <span>Hardcore: also disable undo and copy while active</span>
          <input
            type="checkbox"
            checked={hardcore}
            onChange={(e) => setHardcore(e.target.checked)}
          />
        </label>

        <div className="duress-form-actions">
          <button type="button" className="primary-button" onClick={handleConfirm}>
            Start writing
          </button>
          <button type="button" className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
