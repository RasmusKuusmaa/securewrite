import type { BackendMode } from "../store/useBackendMode";

interface ModeSelectProps {
  onChoose: (mode: BackendMode) => void;
}

// First-launch-only screen: local-only IndexedDB vault vs an account synced
// through ../../server. Persisted by useBackendMode once chosen - see
// AccountAuthForm/SyncUnlockScreen/UnlockScreen for the "switch mode" escape
// hatch back to this choice.
export default function ModeSelect({ onChoose }: ModeSelectProps) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Where should your writing live?</h1>
        <p className="auth-subtitle">You can switch later, but notes don't move between modes.</p>

        <button type="button" className="primary-button" onClick={() => onChoose("local")}>
          Use this device only
        </button>
        <p className="auth-subtitle mode-select-hint">
          Nothing ever leaves this browser. No account, no server, works offline.
        </p>

        <button type="button" className="primary-button mode-select-outline" onClick={() => onChoose("sync")}>
          Create or sign in to an account
        </button>
        <p className="auth-subtitle mode-select-hint">
          Encrypted end-to-end and synced across devices. The server sees your username and
          encrypted blobs, but never your password, recovery key, or writing.
        </p>
      </div>
    </div>
  );
}
