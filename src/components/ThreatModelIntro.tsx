interface ThreatModelIntroProps {
  onContinue: () => void;
}

export default function ThreatModelIntro({ onContinue }: ThreatModelIntroProps) {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Before you start writing</h1>
        <p className="auth-subtitle">This app protects against casual, opportunistic access:</p>
        <ul className="threat-list threat-list-good">
          <li>Someone glancing at your screen</li>
          <li>Someone picking up your unlocked or shut laptop and opening the app</li>
          <li>Someone skimming your files if they get onto the machine</li>
        </ul>
        <p className="auth-subtitle">It does not protect against:</p>
        <ul className="threat-list threat-list-bad">
          <li>A keylogger or spyware already installed on the machine</li>
          <li>Forensic recovery of RAM or deleted disk sectors</li>
          <li>Screen-recording or remote desktop software</li>
          <li>Someone who already knows your password</li>
          <li>Legal or forensic seizure of the device</li>
        </ul>
        <button type="button" className="primary-button" onClick={onContinue}>
          I understand, continue
        </button>
      </div>
    </div>
  );
}
