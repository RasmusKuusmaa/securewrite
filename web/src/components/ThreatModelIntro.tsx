interface ThreatModelIntroProps {
  onContinue: () => void;
  // "local" (default): pure IndexedDB vault, nothing leaves the device.
  // "sync": account mode backed by ../../server - the closing paragraph below
  // has to say so, since "nothing is sent anywhere" would just be false there.
  mode?: "local" | "sync";
}

// This is the browser build's threat model, not the desktop app's - deliberately
// different copy. The desktop build hardens things a browser tab structurally
// can't (excluding the window from screen capture, suppressing taskbar
// thumbnails, Rust-level key zeroization). None of that applies here, so this
// screen says so plainly rather than borrowing the desktop app's stronger claims.
export default function ThreatModelIntro({ onContinue, mode = "local" }: ThreatModelIntroProps) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Before you start writing</h1>
        <p className="auth-subtitle">This app protects against casual, opportunistic access:</p>
        <ul className="threat-list threat-list-good">
          <li>Someone glancing at your screen (masked view scrambles the text)</li>
          <li>Someone opening this browser on this device without your password</li>
          <li>Someone skimming this browser's storage - notes are encrypted at rest</li>
        </ul>
        <p className="auth-subtitle">It does not protect against:</p>
        <ul className="threat-list threat-list-bad">
          <li>A keylogger, spyware, or browser extension already on this device</li>
          <li>Screen-recording, remote desktop, or screen-sharing software</li>
          <li>
            On a managed/work computer: endpoint monitoring or screenshot software your IT
            department may run - this app can't see or defend against that
          </li>
          <li>Someone with DevTools access while the vault is unlocked</li>
          <li>Someone who already knows your password</li>
          <li>Forensic recovery of browser memory or disk</li>
        </ul>
        <p className="auth-subtitle">
          Unlike the desktop version, a browser tab can't be excluded from screen capture or hide
          from a taskbar preview - closing the tab doesn't guarantee this device's memory is
          scrubbed the way quitting the desktop app does.
        </p>
        {mode === "local" ? (
          <p className="auth-subtitle">
            Your notes stay in this browser's local storage on this device only - nothing is sent
            anywhere.
          </p>
        ) : (
          <p className="auth-subtitle">
            This account syncs your notes through a server. That server sees your username, when
            you sign in, and encrypted blobs it can't read - it never sees your password, your
            recovery key, or a single word of what you write, and it can't derive the key that
            would let it.
          </p>
        )}
        <button type="button" className="primary-button" onClick={onContinue}>
          I understand, continue
        </button>
      </div>
    </div>
  );
}
