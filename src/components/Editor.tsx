import { useEffect, useMemo, useRef, useState } from "react";
import { useDocuments } from "../store/useDocuments";
import SearchBar from "./SearchBar";
import { scrambleText } from "../lib/mask";

const AUTOSAVE_DELAY_MS = 2500;

export default function Editor() {
  const activeDoc = useDocuments((s) => s.activeDoc);
  const saving = useDocuments((s) => s.saving);
  const setActiveContent = useDocuments((s) => s.setActiveContent);
  const setActiveTitle = useDocuments((s) => s.setActiveTitle);
  const saveActive = useDocuments((s) => s.saveActive);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const [searchOpen, setSearchOpen] = useState(false);
  const [masked, setMasked] = useState(false);

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
      </div>

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
            scheduleSave();
          }}
          onScroll={syncOverlayScroll}
          onBlur={flushSave}
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
