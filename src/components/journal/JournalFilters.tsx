import { useJournal } from "../../store/useJournal";
import {
  RANGE_PRESETS,
  colorForSlot,
  isFilterNarrowed,
  subKey,
  GENERAL_LABEL,
  type ActivityInfo,
  type RangePreset,
  type ShowKind,
  DEFAULT_RANGE,
} from "../../lib/journal";
import { useMaskText } from "./useMaskText";

interface Props {
  catalog: ActivityInfo[];
  /** The calendar pages by month itself, so it hides the range control. */
  showRange: boolean;
  /** Stats are about time, so they hide the time/journal switch. */
  showKind: boolean;
}

const KINDS: { value: ShowKind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "time", label: "Time" },
  { value: "note", label: "Journal" },
];

export default function JournalFilters({ catalog, showRange, showKind }: Props) {
  const filter = useJournal((s) => s.filter);
  const setFilter = useJournal((s) => s.setFilter);
  const resetFilter = useJournal((s) => s.resetFilter);
  const mask = useMaskText();

  const toggleActivity = (name: string) => {
    if (filter.activities.includes(name)) {
      // Deselecting an activity drops its sub-activity picks with it.
      setFilter({
        activities: filter.activities.filter((a) => a !== name),
        subs: filter.subs.filter((k) => !k.startsWith(name + "\u001f")),
      });
    } else {
      setFilter({ activities: [...filter.activities, name] });
    }
  };

  const toggleSub = (key: string) => {
    setFilter({
      subs: filter.subs.includes(key) ? filter.subs.filter((k) => k !== key) : [...filter.subs, key],
    });
  };

  const selected = catalog.filter((a) => filter.activities.includes(a.name));
  const narrowed = isFilterNarrowed(filter) || (showRange && filter.range !== DEFAULT_RANGE);
  const activityChips = filter.show !== "note";

  return (
    <div className="journal-filters">
      <div className="journal-filter-row">
        {showKind && (
          <div className="journal-segmented" role="radiogroup" aria-label="Entry type">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={filter.show === k.value}
                className={filter.show === k.value ? "active" : ""}
                onClick={() => setFilter({ show: k.value })}
              >
                {k.label}
              </button>
            ))}
          </div>
        )}
        {showRange && (
          <>
            <select
              className="journal-select"
              value={filter.range}
              onChange={(e) => setFilter({ range: e.target.value as RangePreset })}
              aria-label="Date range"
            >
              {RANGE_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {filter.range === "custom" && (
              <>
                <input
                  type="date"
                  className="journal-input"
                  value={filter.from}
                  onChange={(e) => e.target.value && setFilter({ from: e.target.value })}
                  aria-label="From"
                />
                <span className="journal-muted">to</span>
                <input
                  type="date"
                  className="journal-input"
                  value={filter.to}
                  onChange={(e) => e.target.value && setFilter({ to: e.target.value })}
                  aria-label="To"
                />
              </>
            )}
          </>
        )}
        <input
          type="search"
          className="journal-input journal-search"
          placeholder="Search notes and journal..."
          value={filter.query}
          onChange={(e) => setFilter({ query: e.target.value })}
        />
        {narrowed && (
          <button type="button" className="journal-link" onClick={resetFilter}>
            Clear filters
          </button>
        )}
      </div>

      {activityChips && catalog.length > 0 && (
        <div className="journal-filter-row journal-chips" aria-label="Filter by activity">
          {catalog.map((a) => (
            <button
              key={a.name}
              type="button"
              className={`journal-chip ${filter.activities.includes(a.name) ? "active" : ""}`}
              onClick={() => toggleActivity(a.name)}
              aria-pressed={filter.activities.includes(a.name)}
            >
              <span className="journal-dot" style={{ background: colorForSlot(a.slot) }} />
              {mask(a.name)}
            </button>
          ))}
        </div>
      )}

      {activityChips && selected.some((a) => a.subs.length > 0) && (
        <div className="journal-filter-row journal-chips" aria-label="Filter by sub-activity">
          {selected
            .filter((a) => a.subs.length > 0)
            .flatMap((a) =>
              [...a.subs, null].map((sub) => {
                const key = subKey(a.name, sub);
                return (
                  <button
                    key={key}
                    type="button"
                    className={`journal-chip journal-chip-sub ${filter.subs.includes(key) ? "active" : ""}`}
                    onClick={() => toggleSub(key)}
                    aria-pressed={filter.subs.includes(key)}
                  >
                    <span className="journal-muted">{mask(a.name)} /</span> {sub === null ? GENERAL_LABEL : mask(sub)}
                  </button>
                );
              }),
            )}
        </div>
      )}
    </div>
  );
}
