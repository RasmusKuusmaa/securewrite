import { useEffect, useState } from "react";
import { invoke } from "../lib/invoke";
import { useVault } from "../store/useVault";

// Rendered only from SettingsPanel, and only when !isDecoy - see
// setup_duress_password in vaultService.ts for why this must stay
// unreachable (and thus undiscoverable) from inside the decoy vault.
export default function DuressPasswordSetup() {
  const setupDuressPassword = useVault((s) => s.setupDuressPassword);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    invoke<boolean>("has_duress_configured").then(setConfigured);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await setupDuressPassword(password);
      setConfigured(true);
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 4000);
      setPassword("");
      setConfirm("");
      setExpanded(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="duress-section">
      <div className="settings-row">
        <span>Duress password (advanced)</span>
        <span className="duress-status">{configured ? "Configured" : "Not set"}</span>
      </div>
      <p className="auth-subtitle duress-hint">
        A second password that opens a separate, empty decoy instead of your real writing.
        Nothing in the app reveals this exists - remember it yourself. Must be different from
        your master password, or it'll never trigger.
      </p>

      {!expanded && (
        <button type="button" className="secondary-button" onClick={() => setExpanded(true)}>
          {configured ? "Reset duress password" : "Set up duress password"}
        </button>
      )}

      {expanded && (
        <form onSubmit={handleSubmit} className="duress-form">
          {configured && (
            <p className="auth-error">
              Resetting replaces the decoy - any existing decoy content becomes permanently
              unreadable.
            </p>
          )}
          <input
            type="password"
            placeholder="Duress password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <input
            type="password"
            placeholder="Confirm duress password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {error && <p className="auth-error">{error}</p>}
          <div className="duress-form-actions">
            <button type="submit" className="primary-button" disabled={submitting}>
              {submitting ? "Saving..." : "Save"}
            </button>
            <button type="button" className="secondary-button" onClick={() => setExpanded(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {justSaved && <p className="duress-hint">Duress password saved.</p>}
    </div>
  );
}
