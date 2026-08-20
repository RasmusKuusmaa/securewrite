import { useState } from "react";
import { useVault } from "../store/useVault";
import ThreatModelIntro from "./ThreatModelIntro";
import SetupScreen from "./SetupScreen";
import RecoveryKeyDisplay from "./RecoveryKeyDisplay";

type Step = "intro" | "password" | "recovery";

interface SetupFlowProps {
  // setup_vault() flips the store's initialized/unlocked flags immediately,
  // before the user has acknowledged the recovery key - so App must keep
  // rendering this flow until onDone() fires, rather than un-mounting it as
  // soon as `initialized` turns true.
  onDone: () => void;
}

export default function SetupFlow({ onDone }: SetupFlowProps) {
  const setup = useVault((s) => s.setup);
  const [step, setStep] = useState<Step>("intro");
  const [recoveryKey, setRecoveryKey] = useState("");

  if (step === "intro") {
    return <ThreatModelIntro onContinue={() => setStep("password")} />;
  }

  if (step === "password") {
    return (
      <SetupScreen
        onSubmit={async (password) => {
          const key = await setup(password);
          setRecoveryKey(key);
          setStep("recovery");
        }}
      />
    );
  }

  return <RecoveryKeyDisplay recoveryKey={recoveryKey} onContinue={onDone} />;
}
