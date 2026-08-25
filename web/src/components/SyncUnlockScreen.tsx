import { useState } from "react";
import { useVault } from "../store/useVault";
import { useBackendMode } from "../store/useBackendMode";

// Sync-mode counterpart to UnlockScreen: shown when the server session is
// still valid (cookie survived a reload) but the vault key isn't in memory -
// the key only ever lives in JS memory, so the password is still needed to
// re-derive the KEK and unwrap it, even though the server already knows who
// you are.
export default function SyncUnlockScreen() {
  const username = useVault((s) => s.username);
  const unlockWithPassword = useVault((s) => s.unlockWithPassword);
  const unlockWithRecoveryKey = useVault((s) => s.unlockWithRecoveryKey);
  const logout = useVault((s) => s.logout);
  const resetMode = useBackendMode((s) => s.reset);

  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) return;
    setError(null);
    setSubmitting(true);
    try {
      if (useRecovery) {
        await unlockWithRecoveryKey(value, username);
      } else {
        await unlockWithPassword(value, username);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
      setValue("");
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Locked</h1>
        <p className="auth-subtitle">Signed in as {username}</p>
        <form onSubmit={handleSubmit}>
          <input
            type={useRecovery ? "text" : "password"}
            placeholder={useRecovery ? "Recovery key" : "Password"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            spellCheck={false}
          />
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="primary-button" disabled={submitting || !value}>
            {submitting ? "Unlocking..." : "Unlock"}
          </button>
        </form>
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setUseRecovery((v) => !v);
            setError(null);
            setValue("");
          }}
        >
          {useRecovery ? "Use password instead" : "Use recovery key instead"}
        </button>
        <button type="button" className="link-button" onClick={() => logout()}>
          Sign out
        </button>
        <button type="button" className="link-button" onClick={resetMode}>
          Use this device only instead
        </button>
      </div>
    </div>
  );
}
