import { useEffect, useMemo, useState } from "react";
import { useJournal, type JournalTab } from "../../store/useJournal";
import type { JournalEntry } from "../../types";
import { buildCatalog, todayStr } from "../../lib/journal";
import JournalFilters from "./JournalFilters";
import EntryForm from "./EntryForm";
import JournalLog from "./JournalLog";
import JournalCalendar from "./JournalCalendar";
import JournalStatsView from "./JournalStats";

const TABS: { value: JournalTab; label: string }[] = [
  { value: "log", label: "Log" },
  { value: "calendar", label: "Calendar" },
  { value: "stats", label: "Stats" },
];

/** What the entry form is editing: a saved entry, or a new one on a date. */
export type FormTarget = { entry: JournalEntry } | { date: string };

export default function JournalView() {
  const entries = useJournal((s) => s.entries);
  const loaded = useJournal((s) => s.loaded);
  const load = useJournal((s) => s.load);
  const tab = useJournal((s) => s.tab);
  const setTab = useJournal((s) => s.setTab);
  const masked = useJournal((s) => s.masked);
  const setMasked = useJournal((s) => s.setMasked);

  const [formTarget, setFormTarget] = useState<FormTarget | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load().catch((err) => setError(String(err)));
  }, [load]);

  const catalog = useMemo(() => buildCatalog(entries), [entries]);

  // Same privacy affordances as the editor: Ctrl+Shift+H toggles the mask,
  // alt-tabbing away masks automatically.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setMasked(!useJournal.getState().masked);
      }
    };
    const handleBlur = () => setMasked(true);
    window.addEventListener("keydown", handler);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("blur", handleBlur);
    };
  }, [setMasked]);

  const openNew = (date: string = todayStr()) => setFormTarget({ date });
  const openEdit = (entry: JournalEntry) => setFormTarget({ entry });

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
            onClick={() => setMasked(!masked)}
            title="Toggle masked view (Ctrl+Shift+H)"
          >
            {masked ? "Unmask" : "Mask"}
          </button>
          <button type="button" className="journal-primary" onClick={() => openNew()}>
            + Log time
          </button>
        </div>
      </div>

      <JournalFilters catalog={catalog} showRange={tab !== "calendar"} />

      <div className="journal-body">
        {error && <p className="journal-error">Couldn't load the journal: {error}</p>}
        {!loaded && !error && <p className="journal-empty">Loading...</p>}
        {loaded && entries.length === 0 && (
          <div className="journal-empty">
            <p>Nothing logged yet.</p>
            <p className="journal-hint">
              Log what you worked on and for how long - e.g. 3h of Studies split into 1h 30m Math,
              1h Physics and 30m Philosophy - and the calendar and stats fill in from there.
            </p>
            <button type="button" className="journal-primary" onClick={() => openNew()}>
              + Log your first entry
            </button>
          </div>
        )}
        {loaded && entries.length > 0 && tab === "log" && (
          <JournalLog catalog={catalog} onEdit={openEdit} />
        )}
        {loaded && entries.length > 0 && tab === "calendar" && (
          <JournalCalendar catalog={catalog} onEdit={openEdit} onAdd={openNew} />
        )}
        {loaded && entries.length > 0 && tab === "stats" && <JournalStatsView catalog={catalog} />}
      </div>

      {formTarget && (
        <EntryForm target={formTarget} catalog={catalog} onClose={() => setFormTarget(null)} />
      )}
    </main>
  );
}
