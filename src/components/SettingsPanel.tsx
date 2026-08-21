import { useSettings } from "../store/useSettings";

interface SettingsPanelProps {
  onClose: () => void;
}

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const idleTimeoutMinutes = useSettings((s) => s.idleTimeoutMinutes);
  const lockOnBlur = useSettings((s) => s.lockOnBlur);
  const update = useSettings((s) => s.update);

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span>Settings</span>
          <button type="button" className="icon-button" onClick={onClose}>
            ✕
          </button>
        </div>

        <label className="settings-row">
          <span>Auto-lock after inactivity (minutes)</span>
          <input
            type="number"
            min={1}
            max={120}
            value={idleTimeoutMinutes}
            onChange={(e) => {
              const value = Math.max(1, Math.min(120, Number(e.target.value) || 1));
              update({ idleTimeoutMinutes: value });
            }}
          />
        </label>

        <label className="settings-row settings-row-checkbox">
          <span>Lock when the window loses focus</span>
          <input
            type="checkbox"
            checked={lockOnBlur}
            onChange={(e) => update({ lockOnBlur: e.target.checked })}
          />
        </label>
      </div>
    </div>
  );
}
