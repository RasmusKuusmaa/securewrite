import { useEffect, useMemo, useState } from "react";
import { useJournal, type JournalTab } from "../../store/useJournal";
import { useMask } from "../../store/useMask";
import { useSettings } from "../../store/useSettings";
import type { JournalEntry, JournalKind } from "../../types";
import { buildCatalog, todayStr } from "../../lib/journal";
import JournalFilters from "./JournalFilters";
import EntryForm from "./EntryForm";
import NoteForm from "./NoteForm";
import JournalLog from "./JournalLog";
import JournalCalendar from "./JournalCalendar";
import JournalStatsView from "./JournalStats";

const TABS: { value: JournalTab; label: string }[] = [
  { value: "log", label: "Log" },
  { value: "calendar", label: "Calendar" },
  { value: "stats", label: "Stats" },
];

/** What a form is editing: a saved entry, or a new one of a kind on a date. */
export type FormTarget = { entry: JournalEntry } | { kind: JournalKind; date: string };

export default function JournalView() {
  const entries = useJournal((s) => s.entries);
  const loaded = useJournal((s) => s.loaded);
  const load = useJournal((s) => s.load);
  const tab = useJournal((s) => s.tab);
  const setTab = useJournal((s) => s.setTab);
  const masked = useMask((s) => s.masked);
  const toggleMask = useMask((s) => s.toggle);
  const maskShortcut = useSettings((s) => s.maskShortcut);

  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load().catch((err) => setError(String(err)));
  }, [load]);

  const catalog = useMemo(() => buildCatalog(entries), [entries]);

  const openNew = (kind: JournalKind, date: string = todayStr()) => setFormTarget({ kind, date });
  const openEdit = (entry: JournalEntry) => setFormTarget({ entry });
  const formKind = formTarget && ("entry" in formTarget ? formTarget.entry.kind : formTarget.kind);

  return (
    <main className="journal">
      <div className="journal-header">
        <div className="journal-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              className={`journal-tab ${tab === t.value ? "active" : ""}`}
              onClick={() => setTab(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="journal-header-actions">
          <button
            type="button"
            className={`icon-button ${masked ? "icon-button-active" : ""}`}
            onClick={toggleMask}
            title={`Toggle masked view (${maskShortcut})`}
          >
            {masked ? "Unmask" : "Mask"}
          </button>
          <button type="button" className="journal-secondary" onClick={() => openNew("note")}>
            + Journal
          </button>
          <button type="button" className="journal-primary" onClick={() => openNew("time")}>
            + Log time
          </button>
        </div>
      </div>

      <JournalFilters catalog={catalog} showRange={tab !== "calendar"} showKind={tab !== "stats"} />

      <div className="journal-body">
        {error && <p className="journal-error">Couldn't load the journal: {error}</p>}
        {!loaded && !error && <p className="journal-empty">Loading...</p>}
        {loaded && entries.length === 0 && (
          <div className="journal-empty">
            <p>Nothing here yet.</p>
            <p className="journal-hint">
              <b>Log time</b> to track what you worked on and for how long - e.g. 3h of Studies split into 1h 30m
              Math, 1h Physics and 30m Philosophy - and the calendar and stats fill in from there.{" "}
              <b>Journal</b> is for free-form writing about your day.
            </p>
            <div className="journal-empty-actions">
              <button type="button" className="journal-secondary" onClick={() => openNew("note")}>
                + Write a journal entry
              </button>
              <button type="button" className="journal-primary" onClick={() => openNew("time")}>
                + Log time
              </button>
            </div>
          </div>
        )}
        {loaded && entries.length > 0 && tab === "log" && <JournalLog catalog={catalog} onEdit={openEdit} />}
        {loaded && entries.length > 0 && tab === "calendar" && (
          <JournalCalendar catalog={catalog} onEdit={openEdit} onAdd={openNew} />
        )}
        {loaded && entries.length > 0 && tab === "stats" && <JournalStatsView catalog={catalog} />}
      </div>

      {formTarget && formKind === "time" && (
        <EntryForm target={formTarget} catalog={catalog} onClose={() => setFormTarget(null)} />
      )}
      {formTarget && formKind === "note" && <NoteForm target={formTarget} onClose={() => setFormTarget(null)} />}
    </main>
  );
}
