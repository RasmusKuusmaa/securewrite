import { useEffect, useMemo, useRef, useState } from "react";
import { useDocuments } from "../store/useDocuments";
import { useSettings } from "../store/useSettings";
import SearchBar from "./SearchBar";
import FlowModeDialog from "./FlowModeDialog";
import { scrambleText } from "../lib/mask";

const AUTOSAVE_DELAY_MS = 2500;
const FLOW_TICK_MS = 100;

export default function Editor() {
  const activeDoc = useDocuments((s) => s.activeDoc);
  const saving = useDocuments((s) => s.saving);
  const setActiveContent = useDocuments((s) => s.setActiveContent);
  const setActiveTitle = useDocuments((s) => s.setActiveTitle);
  const saveActive = useDocuments((s) => s.saveActive);
  const flowPauseSeconds = useSettings((s) => s.flowPauseSeconds);
  const flowHardcore = useSettings((s) => s.flowHardcore);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const [searchOpen, setSearchOpen] = useState(false);
  const [masked, setMasked] = useState(false);

  // Flow-writing mode: opt-in per session, off whenever the active document
  // changes. Pausing past the threshold wipes back to flowCheckpoint - the
  // content as of the moment flow mode was last turned on (see
  // FlowModeDialog / todo.md 3.4).
  const [flowMode, setFlowMode] = useState(false);
  const [showFlowConfirm, setShowFlowConfirm] = useState(false);
  const [flowProgress, setFlowProgress] = useState(0);
  const [flowJustWiped, setFlowJustWiped] = useState(false);
  const flowCheckpoint = useRef("");
  const lastKeystroke = useRef(0);

  const scheduleSave = () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveActive();
    }, AUTOSAVE_DELAY_MS);
  };

  const flushSave = () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
    }
    saveActive();
  };

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [activeDoc?.id]);

  // Never let flow mode carry across documents - re-opt-in is required per doc.
  useEffect(() => {
    setFlowMode(false);
    setFlowProgress(0);
  }, [activeDoc?.id]);

  // Ticks while flow mode is active, wiping back to the checkpoint once the
  // pause threshold is crossed. Runs on a plain interval rather than
  // scheduling a single timeout so the progress indicator can update
  // continuously and every keystroke can push the deadline out cheaply.
  useEffect(() => {
    if (!flowMode) return;
    const thresholdMs = flowPauseSeconds * 1000;
    const id = window.setInterval(() => {
      const elapsed = Date.now() - lastKeystroke.current;
      if (elapsed >= thresholdMs) {
        setActiveContent(flowCheckpoint.current);
        lastKeystroke.current = Date.now();
        setFlowProgress(0);
        setFlowJustWiped(true);
        window.setTimeout(() => setFlowJustWiped(false), 1500);
      } else {
        setFlowProgress(elapsed / thresholdMs);
      }
    }, FLOW_TICK_MS);
    return () => window.clearInterval(id);
  }, [flowMode, flowPauseSeconds, setActiveContent]);

  const enterFlowMode = () => {
    if (!activeDoc) return;
    flowCheckpoint.current = activeDoc.content;
    lastKeystroke.current = Date.now();
    setFlowProgress(0);
    setFlowMode(true);
  };

  // The only way out is "save and exit" - flow mode's whole point is that
  // there's no discard-without-saving path back to a normal session.
  const exitFlowMode = () => {
    setFlowMode(false);
    setFlowProgress(0);
    flushSave();
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setMasked((v) => !v);
      } else if (e.key === "Escape") {
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Auto-mask when the window loses focus (alt-tab away) or this tab is
  // switched away from - always on, since re-revealing is a single
  // click/shortcut away and costs nothing to leave enabled. Tab-hide matters
  // more than window blur in a browser: switching tabs within the same
  // window is the common case, not just switching OS windows.
  useEffect(() => {
    const handleBlur = () => setMasked(true);
    const handleVisibility = () => {
      if (document.hidden) setMasked(true);
    };
    window.addEventListener("blur", handleBlur);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("blur", handleBlur);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const syncOverlayScroll = () => {
    if (overlayRef.current && textareaRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
      overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  if (!activeDoc) {
    return (
      <main className="editor editor-empty">
        <p>No document open</p>
      </main>
    );
  }

  const content = activeDoc.content;
  const words = content.trim().length === 0 ? 0 : content.trim().split(/\s+/).length;
  const chars = content.length;

  // Recomputed on every render while masked so identical letters don't get
  // the same glyph twice in a row - no stable mapping for an observer to
  // learn over time.
  const maskedContent = useMemo(() => (masked ? scrambleText(content) : ""), [masked, content]);

  return (
    <main className="editor">
      <div className="editor-header">
        <input
          className="editor-title"
          value={activeDoc.title}
          onChange={(e) => {
            setActiveTitle(e.target.value);
            scheduleSave();
          }}
          onBlur={flushSave}
          placeholder="Untitled"
        />
        <button
          type="button"
          className={`icon-button ${masked ? "icon-button-active" : ""}`}
          onClick={() => setMasked((v) => !v)}
          title="Toggle masked view (Ctrl+Shift+H)"
        >
          {masked ? "Unmask" : "Mask"}
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={() => setSearchOpen((v) => !v)}
          title="Find (Ctrl+F)"
        >
          Find
        </button>
        <button
          type="button"
          className={`icon-button ${flowMode ? "icon-button-active" : ""}`}
          onClick={() => (flowMode ? exitFlowMode() : setShowFlowConfirm(true))}
          title="Flow-writing mode: wipes unsaved progress if you pause too long"
        >
          {flowMode ? "Exit flow" : "Flow"}
        </button>
      </div>

      {showFlowConfirm && (
        <FlowModeDialog
          onConfirm={() => {
            setShowFlowConfirm(false);
            enterFlowMode();
          }}
          onCancel={() => setShowFlowConfirm(false)}
        />
      )}

      {flowMode && (
        <div className="flow-status">
          <div className="flow-progress-track">
            <div
              className="flow-progress-fill"
              style={{ width: `${Math.min(1, flowProgress) * 100}%` }}
            />
          </div>
          <span className="flow-status-text">
            {flowJustWiped ? "Wiped - paused too long" : "Keep typing or it wipes"}
          </span>
        </div>
      )}

      {searchOpen && (
        <SearchBar
          textareaRef={textareaRef}
          content={content}
          onClose={() => setSearchOpen(false)}
        />
      )}

      <div className="editor-textarea-wrap">
        <textarea
          ref={textareaRef}
          className="editor-textarea"
          style={masked ? { color: "transparent", caretColor: "var(--accent)" } : undefined}
          value={content}
          onChange={(e) => {
            setActiveContent(e.target.value);
            if (flowMode) {
              // Autosave is suppressed in flow mode - persisting the draft
              // to disk mid-session would defeat the point of the wipe.
              lastKeystroke.current = Date.now();
            } else {
              scheduleSave();
            }
          }}
          onScroll={syncOverlayScroll}
          onBlur={flowMode ? undefined : flushSave}
          onCopy={(e) => {
            if (flowMode && flowHardcore) e.preventDefault();
          }}
          onCut={(e) => {
            if (flowMode && flowHardcore) e.preventDefault();
          }}
          onKeyDown={(e) => {
            if (!flowMode || !flowHardcore) return;
            const key = e.key.toLowerCase();
            if ((e.ctrlKey || e.metaKey) && (key === "z" || key === "y")) {
              e.preventDefault();
            }
          }}
          placeholder="Start writing..."
          spellCheck={false}
        />
        {masked && (
          <div ref={overlayRef} className="editor-mask-overlay" aria-hidden="true">
            {maskedContent}
          </div>
        )}
      </div>

      <div className="editor-footer">
        <span>{words} words</span>
        <span>{chars} characters</span>
        <span className="save-status">{saving ? "Saving..." : "Saved"}</span>
      </div>
    </main>
  );
}
