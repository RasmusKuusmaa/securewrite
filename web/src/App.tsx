import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import Editor from "./components/Editor";
import SetupFlow from "./components/SetupFlow";
import UnlockScreen from "./components/UnlockScreen";
import ModeSelect from "./components/ModeSelect";
import SyncAuthFlow from "./components/SyncAuthFlow";
import SyncUnlockScreen from "./components/SyncUnlockScreen";
import { useDocuments } from "./store/useDocuments";
import { useVault } from "./store/useVault";
import { useSettings } from "./store/useSettings";
import { useBackendMode } from "./store/useBackendMode";
import "./App.css";

function App() {
  const mode = useBackendMode((s) => s.mode);
  const chooseMode = useBackendMode((s) => s.choose);

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
    if (!mode) return;
    checkStatus();
    useSettings.getState().load();
  }, [mode, checkStatus]);

  // Re-derive showSetupFlow whenever the backend mode changes (e.g. the user
  // switched from local to sync or vice versa) instead of staying latched on
  // whichever mode's decision was made first.
  useEffect(() => {
    setShowSetupFlow(null);
  }, [mode]);

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

  // In a browser, switching away from this tab (not just losing OS window
  // focus) is the moment a coworker is most likely to glance at your screen -
  // so lock-on-blur triggers on both window blur and the tab going hidden.
  useEffect(() => {
    if (!unlocked) return;
    const maybeLock = () => {
      if (useSettings.getState().lockOnBlur) {
        useVault.getState().lock();
      }
    };
    const handleVisibility = () => {
      if (document.hidden) maybeLock();
    };
    window.addEventListener("blur", maybeLock);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("blur", maybeLock);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
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

  // No Tauri window/process to hook a close event on - best-effort flush the
  // active document whenever the tab is closed or backgrounded, since
  // "beforeunload" handlers can't reliably await an async save.
  useEffect(() => {
    const flush = () => {
      useDocuments.getState().saveActive();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) flush();
    });
    return () => {
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  if (!mode) {
    return <ModeSelect onChoose={chooseMode} />;
  }

  if (vaultLoading || showSetupFlow === null) {
    return <div className="app-loading">Loading...</div>;
  }

  if (showSetupFlow) {
    return mode === "sync" ? (
      <SyncAuthFlow onDone={() => setShowSetupFlow(false)} />
    ) : (
      <SetupFlow onDone={() => setShowSetupFlow(false)} />
    );
  }

  if (!unlocked) {
    return mode === "sync" ? <SyncUnlockScreen /> : <UnlockScreen />;
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
