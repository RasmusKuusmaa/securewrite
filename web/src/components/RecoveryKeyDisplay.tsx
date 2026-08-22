import { useRef, useState } from "react";

interface RecoveryKeyDisplayProps {
  recoveryKey: string;
  onContinue: () => void;
}

export default function RecoveryKeyDisplay({ recoveryKey, onContinue }: RecoveryKeyDisplayProps) {
  const [saved, setSaved] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectAll = () => {
    textareaRef.current?.select();
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Save your recovery key</h1>
        <p className="auth-subtitle">
          This is the <strong>only</strong> way back into your writing if you forget your
          password. There is no hidden master password and no "reset" option - that would be a
          backdoor. Copy this somewhere safe outside the app (a password manager, or written down
          somewhere private) before continuing.
        </p>

        <textarea
          ref={textareaRef}
          className="recovery-key-box"
          value={recoveryKey}
          readOnly
          onFocus={selectAll}
          rows={2}
        />
        <button type="button" className="secondary-button" onClick={selectAll}>
          Select all
        </button>

        <label className="auth-checkbox">
          <input
            type="checkbox"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
          />
          I've saved my recovery key somewhere safe
        </label>

        <button type="button" className="primary-button" disabled={!saved} onClick={onContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
