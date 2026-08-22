import { useState } from "react";

interface SetupScreenProps {
  onSubmit: (password: string) => Promise<void>;
}

export default function SetupScreen({ onSubmit }: SetupScreenProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
      await onSubmit(password);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Choose a master password</h1>
        <p className="auth-subtitle">
          This encrypts everything you write. There's no way to reset it - only your password or
          the recovery key you'll get next can unlock your writing.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Master password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <input
            type="password"
            placeholder="Confirm password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting ? "Setting up..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
