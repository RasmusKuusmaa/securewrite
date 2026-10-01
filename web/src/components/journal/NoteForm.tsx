import { useEffect, useState } from "react";
import { useJournal } from "../../store/useJournal";
import { useMask } from "../../store/useMask";
import { scrambleText } from "../../lib/mask";
import type { JournalEntry } from "../../types";
import type { FormTarget } from "./JournalView";

interface Props {
  target: FormTarget;
  onClose: () => void;
}

/** Free-form journal writing for a day - no activity, no duration. */
export default function NoteForm({ target, onClose }: Props) {
  const save = useJournal((s) => s.save);
  const masked = useMask((s) => s.masked);
  const existing = "entry" in target ? target.entry : null;

  const [date, setDate] = useState(existing?.date ?? ("date" in target ? target.date : ""));
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const words = body.trim() ? body.trim().split(/\s+/).length : 0;

  const submit = async () => {
    if (!title.trim() && !body.trim()) {
      setError("Write something first");
      return;
    }
    if (!date) {
      setError("Pick a date");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const entry: JournalEntry = {
        id: existing?.id ?? "",
        kind: "note",
        date,
        activity: "",
        minutes: 0,
        parts: [],
        title: title.trim(),
        note: body,
        createdAt: existing?.createdAt ?? 0,
        updatedAt: 0,
      };
      await save(entry);
      onClose();
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  };

  return (
    <div className="journal-modal-backdrop" onMouseDown={onClose}>
      <form
        className="journal-modal journal-form journal-note-form"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <h2>{existing ? "Edit journal entry" : "Journal"}</h2>
        <div className="journal-note-head">
          <input type="date" className="journal-input" value={date} onChange={(e) => setDate(e.target.value)} required />
          <input
            className="journal-input journal-note-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            style={masked ? { color: "transparent" } : undefined}
          />
        </div>
        <div className="journal-note-wrap">
          <textarea
            autoFocus
            className="journal-input journal-note journal-note-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="How was your day? What did you do, think, learn?"
            style={masked ? { color: "transparent", caretColor: "var(--accent)" } : undefined}
            spellCheck={false}
          />
          {masked && (
            <div className="journal-note-mask" aria-hidden="true">
              {scrambleText(body)}
            </div>
          )}
        </div>

        {error && <p className="journal-error">{error}</p>}

        <div className="journal-modal-actions">
          <span className="journal-muted journal-note-count">{words} words</span>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="journal-primary" disabled={saving} title="Ctrl+Enter">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
