import { useState } from "react";
import ThreatModelIntro from "./ThreatModelIntro";
import AccountAuthForm from "./AccountAuthForm";
import RecoveryKeyDisplay from "./RecoveryKeyDisplay";

type Step = "intro" | "auth" | "recovery";

interface SyncAuthFlowProps {
  // Mirrors SetupFlow's onDone latching: a signup logs the user in
  // immediately, but this keeps rendering until the recovery key has been
  // shown, rather than letting App swap to the editor first.
  onDone: () => void;
}

export default function SyncAuthFlow({ onDone }: SyncAuthFlowProps) {
  const [step, setStep] = useState<Step>("intro");
  const [recoveryKey, setRecoveryKey] = useState("");

  if (step === "intro") {
    return <ThreatModelIntro mode="sync" onContinue={() => setStep("auth")} />;
  }

  if (step === "auth") {
    return (
      <AccountAuthForm
        onLoggedIn={onDone}
        onSignedUp={(key) => {
          setRecoveryKey(key);
          setStep("recovery");
        }}
      />
    );
  }

  return <RecoveryKeyDisplay recoveryKey={recoveryKey} onContinue={onDone} />;
}
