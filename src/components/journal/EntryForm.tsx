import { useEffect, useMemo, useRef, useState } from "react";
import { useJournal } from "../../store/useJournal";
import type { JournalEntry } from "../../types";
import { formatDuration, parseDuration, GENERAL_LABEL, type ActivityInfo } from "../../lib/journal";
import type { FormTarget } from "./JournalView";

interface Props {
  target: FormTarget;
  catalog: ActivityInfo[];
  onClose: () => void;
}

interface PartRow {
  key: number;
  name: string;
  duration: string;
}

let rowKey = 0;
const blankRow = (): PartRow => ({ key: rowKey++, name: "", duration: "" });

export default function EntryForm({ target, catalog, onClose }: Props) {
  const save = useJournal((s) => s.save);
  const existing = "entry" in target ? target.entry : null;

  const [date, setDate] = useState(existing?.date ?? ("date" in target ? target.date : ""));
  const [activity, setActivity] = useState(existing?.activity ?? "");
  const [duration, setDuration] = useState(existing && existing.minutes > 0 ? formatDuration(existing.minutes) : "");
  const [parts, setParts] = useState<PartRow[]>(
    existing?.parts.map((p) => ({ key: rowKey++, name: p.name, duration: formatDuration(p.minutes) })) ?? [],
  );
  const [note, setNote] = useState(existing?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const activityRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const totalMinutes = parseDuration(duration);
  const partMinutes = parts.map((p) => parseDuration(p.duration));
  const partsSum = partMinutes.reduce<number>((sum, m) => sum + (m ?? 0), 0);
  const usedParts = parts.filter((p, i) => p.name.trim() && (partMinutes[i] ?? 0) > 0);
  // A blank total with a breakdown means "the total is the breakdown".
  const effectiveTotal = totalMinutes ?? (usedParts.length > 0 ? partsSum : 0);

  const knownSubs = useMemo(
    () => catalog.find((a) => a.name.toLowerCase() === activity.trim().toLowerCase())?.subs ?? [],
    [catalog, activity],
  );
  const recent = catalog.slice(-8).reverse();

  const problem = (() => {
    if (!activity.trim()) return "Pick or type an activity";
    if (!date) return "Pick a date";
    if (duration.trim() && totalMinutes === null) return "Couldn't read the duration - try 1h30m, 1.5 or 90m";
    const bad = parts.findIndex((p, i) => p.duration.trim() && partMinutes[i] === null);
    if (bad >= 0) return `Couldn't read the duration for "${parts[bad].name || "part " + (bad + 1)}"`;
    if (parts.some((p, i) => !p.name.trim() && (partMinutes[i] ?? 0) > 0)) return "A breakdown row has time but no name";
    if (totalMinutes !== null && partsSum > totalMinutes) {
      return `The breakdown (${formatDuration(partsSum)}) is more than the total (${formatDuration(totalMinutes)})`;
    }
    return null;
  })();

  const submit = async (addAnother: boolean) => {
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const entry: JournalEntry = {
        id: existing?.id ?? "",
        date,
        activity: activity.trim(),
        minutes: effectiveTotal,
        parts: usedParts.map((p) => ({ name: p.name.trim(), minutes: parseDuration(p.duration) ?? 0 })),
        note: note.trim(),
        createdAt: existing?.createdAt ?? 0,
        updatedAt: 0,
      };
      await save(entry);
      if (addAnother) {
        // Keep the date - the usual flow is logging several things for one day.
        setActivity("");
        setDuration("");
        setParts([]);
        setNote("");
        setSavedCount((n) => n + 1);
        activityRef.current?.focus();
      } else {
        onClose();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const updatePart = (key: number, patch: Partial<PartRow>) =>
    setParts((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="journal-modal-backdrop" onMouseDown={onClose}>
      <form
        className="journal-modal journal-form"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit(false);
          }
        }}
      >
        <h2>{existing ? "Edit entry" : "Log time"}</h2>

        <div className="journal-form-grid">
          <label>
            <span>Date</span>
            <input type="date" className="journal-input" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label>
            <span>Activity</span>
            <input
              ref={activityRef}
              autoFocus
              className="journal-input"
              list="journal-activities"
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              placeholder="e.g. Studies, Programming, Gym"
            />
            <datalist id="journal-activities">
              {catalog.map((a) => (
                <option key={a.name} value={a.name} />
              ))}
            </datalist>
          </label>
          <label>
            <span>Total time</span>
            <input
              className="journal-input"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder={usedParts.length ? `${formatDuration(partsSum)} (sum of breakdown)` : "e.g. 3h, 1.5, 1h30m, 45m"}
            />
            <small className="journal-muted">
              {duration.trim()
                ? totalMinutes === null
                  ? "Not a duration"
                  : `= ${formatDuration(totalMinutes)}`
                : usedParts.length
                  ? "Blank = sum of the breakdown"
                  : "Blank = done, no time tracked"}
            </small>
          </label>
        </div>

        {!existing && !activity && recent.length > 0 && (
          <div className="journal-chips journal-quick">
            {recent.map((a) => (
              <button key={a.name} type="button" className="journal-chip" onClick={() => setActivity(a.name)}>
                {a.name}
              </button>
            ))}
          </div>
        )}

        <fieldset className="journal-parts">
          <legend>Breakdown (optional)</legend>
          {parts.map((p, i) => (
            <div key={p.key} className="journal-part-row">
              <input
                className="journal-input"
                list="journal-subs"
                value={p.name}
                onChange={(e) => updatePart(p.key, { name: e.target.value })}
                placeholder="e.g. Math"
                aria-label="Sub-activity"
              />
              <input
                className="journal-input journal-part-duration"
                value={p.duration}
                onChange={(e) => updatePart(p.key, { duration: e.target.value })}
                placeholder="1h30m"
                aria-label="Time"
              />
              <span className="journal-muted journal-part-preview">
                {p.duration.trim() && (partMinutes[i] === null ? "?" : formatDuration(partMinutes[i]!))}
              </span>
              <button
                type="button"
                className="icon-button"
                title="Remove"
                onClick={() => setParts((rows) => rows.filter((r) => r.key !== p.key))}
              >
                ×
              </button>
            </div>
          ))}
          <datalist id="journal-subs">
            {knownSubs.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <div className="journal-parts-footer">
            <button type="button" className="journal-link" onClick={() => setParts((rows) => [...rows, blankRow()])}>
              + Add sub-activity
            </button>
            {usedParts.length > 0 && totalMinutes !== null && partsSum <= totalMinutes && (
              <span className="journal-muted">
                {formatDuration(partsSum)} of {formatDuration(totalMinutes)}
                {totalMinutes > partsSum && ` · ${formatDuration(totalMinutes - partsSum)} ${GENERAL_LABEL}`}
              </span>
            )}
          </div>
        </fieldset>

        <label className="journal-note-label">
          <span>Note</span>
          <textarea
            className="journal-input journal-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did you do?"
            rows={4}
          />
        </label>

        {error && <p className="journal-error">{error}</p>}
        {savedCount > 0 && !error && (
          <p className="journal-muted">
            Saved {savedCount} {savedCount === 1 ? "entry" : "entries"} - add the next one for {date}.
          </p>
        )}

        <div className="journal-modal-actions">
          <button type="button" onClick={onClose}>
            {savedCount > 0 ? "Done" : "Cancel"}
          </button>
          {!existing && (
            <button type="button" disabled={saving} onClick={() => submit(true)}>
              Save & add another
            </button>
          )}
          <button type="submit" className="journal-primary" disabled={saving} title="Ctrl+Enter">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
