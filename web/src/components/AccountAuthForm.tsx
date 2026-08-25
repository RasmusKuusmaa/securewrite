import { useState } from "react";
import { useVault } from "../store/useVault";
import { useBackendMode } from "../store/useBackendMode";

interface AccountAuthFormProps {
  // Fires only after a successful login. Signup instead hands the recovery
  // key back to SyncAuthFlow, which shows RecoveryKeyDisplay before onDone.
  onLoggedIn: () => void;
  onSignedUp: (recoveryKey: string) => void;
}

type View = "login" | "signup";

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,32}$/;

export default function AccountAuthForm({ onLoggedIn, onSignedUp }: AccountAuthFormProps) {
  const setup = useVault((s) => s.setup);
  const unlockWithPassword = useVault((s) => s.unlockWithPassword);
  const unlockWithRecoveryKey = useVault((s) => s.unlockWithRecoveryKey);
  const resetMode = useBackendMode((s) => s.reset);

  const [view, setView] = useState<View>("login");
  const [useRecovery, setUseRecovery] = useState(false);
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resetFields = () => {
    setSecret("");
    setConfirm("");
    setError(null);
  };

  const switchView = (next: View) => {
    setView(next);
    setUseRecovery(false);
    resetFields();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!USERNAME_PATTERN.test(username)) {
      setError("Username must be 3-32 characters: letters, numbers, _ or -");
      return;
    }
    if (view === "signup") {
      if (secret.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (secret !== confirm) {
        setError("Passwords don't match.");
        return;
      }
    }

    setError(null);
    setSubmitting(true);
    try {
      if (view === "signup") {
        const recoveryKey = await setup(secret, username);
        onSignedUp(recoveryKey);
        return;
      }
      if (useRecovery) {
        await unlockWithRecoveryKey(secret, username);
      } else {
        await unlockWithPassword(secret, username);
      }
      onLoggedIn();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
      setSecret("");
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>{view === "signup" ? "Create an account" : "Sign in"}</h1>
        {view === "signup" && (
          <p className="auth-subtitle">
            This encrypts everything you write. There's no way to reset your password - only it or
            the recovery key you'll get next can unlock your writing.
          </p>
        )}
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            spellCheck={false}
            autoCapitalize="none"
          />
          <input
            type={useRecovery ? "text" : "password"}
            placeholder={useRecovery ? "Recovery key" : "Password"}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            spellCheck={false}
          />
          {view === "signup" && (
            <input
              type="password"
              placeholder="Confirm password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          )}
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="primary-button" disabled={submitting || !username || !secret}>
            {submitting
              ? view === "signup"
                ? "Creating account..."
                : "Signing in..."
              : view === "signup"
                ? "Continue"
                : "Sign in"}
          </button>
        </form>

        {view === "login" && (
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setUseRecovery((v) => !v);
              resetFields();
            }}
          >
            {useRecovery ? "Use password instead" : "Use recovery key instead"}
          </button>
        )}

        <button type="button" className="link-button" onClick={() => switchView(view === "login" ? "signup" : "login")}>
          {view === "login" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
        </button>

        <button type="button" className="link-button" onClick={resetMode}>
          Use this device only instead
        </button>
      </div>
    </div>
  );
}
