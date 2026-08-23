import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Sidebar from "./components/Sidebar";
import Editor from "./components/Editor";
import SetupFlow from "./components/SetupFlow";
import UnlockScreen from "./components/UnlockScreen";
import { useDocuments } from "./store/useDocuments";
import { useVault } from "./store/useVault";
import { useSettings } from "./store/useSettings";
import "./App.css";

function App() {
  const vaultLoading = useVault((s) => s.loading);
  const initialized = useVault((s) => s.initialized);
  const unlocked = useVault((s) => s.unlocked);
  const checkStatus = useVault((s) => s.checkStatus);

  const docsInit = useDocuments((s) => s.init);
  const docsLoading = useDocuments((s) => s.loading);

  // setup_vault() flips the store's `initialized` flag the instant it
  // resolves - before the user has seen the recovery-key screen - so whether
  // to show SetupFlow is decided once, right when the initial loading check
  // resolves, and latched in state (null = "not decided yet"). Re-deriving
  // this from `initialized` on every render would un-mount SetupFlow the
  // moment setup() completes, skipping straight past the recovery key
  // display.
  const [showSetupFlow, setShowSetupFlow] = useState<boolean | null>(null);

  useEffect(() => {
    checkStatus();
    useSettings.getState().load();
  }, [checkStatus]);

  useEffect(() => {
    if (!vaultLoading && showSetupFlow === null) {
      setShowSetupFlow(!initialized);
    }
  }, [vaultLoading, initialized, showSetupFlow]);

  useEffect(() => {
    if (unlocked) {
      docsInit();
    }
  }, [unlocked, docsInit]);

  useEffect(() => {
    if (!unlocked) return;

    let lastActivity = Date.now();
    const markActive = () => {
      lastActivity = Date.now();
    };
    const activityEvents: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "wheel",
      "touchstart",
    ];
    activityEvents.forEach((evt) => window.addEventListener(evt, markActive));

    const interval = window.setInterval(() => {
      const timeoutMs = useSettings.getState().idleTimeoutMinutes * 60 * 1000;
      if (Date.now() - lastActivity >= timeoutMs) {
        useVault.getState().lock();
      }
    }, 15000);

    return () => {
      activityEvents.forEach((evt) => window.removeEventListener(evt, markActive));
      window.clearInterval(interval);
    };
  }, [unlocked]);

  useEffect(() => {
    if (!unlocked) return;
    const handleBlur = () => {
      if (useSettings.getState().lockOnBlur) {
        useVault.getState().lock();
      }
    };
    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [unlocked]);

  useEffect(() => {
    if (!unlocked) return;
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        useVault.getState().lock();
      }
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [unlocked]);

  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.onCloseRequested(async (event) => {
      event.preventDefault();
      // Route quit through the same path as a manual lock so the vault key
      // and cached plaintext are explicitly zeroized/dropped before the
      // process tears down, rather than relying on OS reclaim timing.
      if (useVault.getState().unlocked) {
        await useVault.getState().lock();
      } else {
        await useDocuments.getState().saveActive();
      }
      await win.destroy();
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  if (vaultLoading || showSetupFlow === null) {
    return <div className="app-loading">Loading...</div>;
  }

  if (showSetupFlow) {
    return <SetupFlow onDone={() => setShowSetupFlow(false)} />;
  }

  if (!unlocked) {
    return <UnlockScreen />;
  }

  if (docsLoading) {
    return <div className="app-loading">Loading...</div>;
  }

  return (
    <div className="app">
      <Sidebar />
      <Editor />
    </div>
  );
}

export default App;
