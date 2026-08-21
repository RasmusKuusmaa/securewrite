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

  // See SetupFlow: setup_vault() flips `initialized`/`unlocked` before the
  // user has acknowledged the recovery key, so completion is tracked here
  // rather than derived from the store.
  const [setupAcknowledged, setSetupAcknowledged] = useState(false);

  useEffect(() => {
    checkStatus();
    useSettings.getState().load();
  }, [checkStatus]);

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
    const win = getCurrentWindow();
    const unlisten = win.onCloseRequested(async (event) => {
      event.preventDefault();
      await useDocuments.getState().saveActive();
      await win.destroy();
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  if (vaultLoading) {
    return <div className="app-loading">Loading...</div>;
  }

  if (!initialized && !setupAcknowledged) {
    return <SetupFlow onDone={() => setSetupAcknowledged(true)} />;
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
