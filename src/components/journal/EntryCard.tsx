import { useState } from "react";
import { useJournal } from "../../store/useJournal";
import type { JournalEntry } from "../../types";
import { colorForSlot, formatDuration, GENERAL_LABEL, type ActivityInfo } from "../../lib/journal";
import { useMaskText } from "./useMaskText";

interface Props {
  entry: JournalEntry;
  catalog: ActivityInfo[];
  onEdit: (entry: JournalEntry) => void;
}

export default function EntryCard({ entry, catalog, onEdit }: Props) {
  const remove = useJournal((s) => s.remove);
  const mask = useMaskText();
  const [confirming, setConfirming] = useState(false);

  const slot = catalog.find((a) => a.name === entry.activity)?.slot ?? -1;
  const allocated = entry.parts.reduce((sum, p) => sum + p.minutes, 0);
  const general = entry.minutes - allocated;

  return (
    <li className="journal-entry">
      <span className="journal-entry-bar" style={{ background: colorForSlot(slot) }} />
      <div className="journal-entry-main">
        <div className="journal-entry-head">
          <span className="journal-entry-activity">{mask(entry.activity)}</span>
          <span className="journal-entry-time">{entry.minutes > 0 ? formatDuration(entry.minutes) : "done"}</span>
        </div>
        {entry.parts.length > 0 && (
          <div className="journal-entry-parts">
            {entry.parts.map((p, i) => (
              <span key={i}>
                {mask(p.name)} <b>{formatDuration(p.minutes)}</b>
              </span>
            ))}
            {general > 0 && (
              <span className="journal-muted">
                {GENERAL_LABEL} <b>{formatDuration(general)}</b>
              </span>
            )}
          </div>
        )}
        {entry.note && <p className="journal-entry-note">{mask(entry.note)}</p>}
      </div>
      <div className="journal-entry-actions">
        {confirming ? (
          <>
            <button type="button" onClick={() => remove(entry.id)}>
              Delete
            </button>
            <button type="button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" className="icon-button" onClick={() => onEdit(entry)} title="Edit">
              Edit
            </button>
            <button type="button" className="icon-button" onClick={() => setConfirming(true)} title="Delete">
              ×
            </button>
          </>
        )}
      </div>
    </li>
  );
}
