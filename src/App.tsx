import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Sidebar from "./components/Sidebar";
import Editor from "./components/Editor";
import { useDocuments } from "./store/useDocuments";
import "./App.css";

function App() {
  const init = useDocuments((s) => s.init);
  const loading = useDocuments((s) => s.loading);

  useEffect(() => {
    init();
  }, [init]);

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

  if (loading) {
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
