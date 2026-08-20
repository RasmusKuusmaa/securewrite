import { useState } from "react";
import { useVault } from "../store/useVault";

export default function UnlockScreen() {
  const unlockWithPassword = useVault((s) => s.unlockWithPassword);
  const unlockWithRecoveryKey = useVault((s) => s.unlockWithRecoveryKey);

  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (useRecovery) {
        await unlockWithRecoveryKey(value);
      } else {
        await unlockWithPassword(value);
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
        <form onSubmit={handleSubmit}>
          <input
            type={useRecovery ? "text" : "password"}
            placeholder={useRecovery ? "Recovery key" : "Master password"}
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
      </div>
    </div>
  );
}
