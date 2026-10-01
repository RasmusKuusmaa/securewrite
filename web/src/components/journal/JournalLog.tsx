import { useMemo, useState } from "react";
import { useJournal } from "../../store/useJournal";
import type { JournalEntry } from "../../types";
import {
  filterNotes,
  filterSegments,
  formatDayLong,
  formatDuration,
  inRange,
  resolveRange,
  toSegments,
  type ActivityInfo,
} from "../../lib/journal";
import EntryCard from "./EntryCard";

const DAYS_PER_PAGE = 30;

interface Props {
  catalog: ActivityInfo[];
  onEdit: (entry: JournalEntry) => void;
}

export default function JournalLog({ catalog, onEdit }: Props) {
  const entries = useJournal((s) => s.entries);
  const filter = useJournal((s) => s.filter);
  const [pages, setPages] = useState(1);

  const { days, total } = useMemo(() => {
    const { from, to } = resolveRange(filter, entries);
    const segments = inRange(filterSegments(toSegments(entries), filter), from, to);
    // entries is already newest-first, so insertion order is display order.
    const byDay = new Map<string, { minutes: number; entries: JournalEntry[] }>();
    let total = 0;
    for (const s of segments) {
      let day = byDay.get(s.date);
      if (!day) {
        day = { minutes: 0, entries: [] };
        byDay.set(s.date, day);
      }
      day.minutes += s.minutes;
      total += s.minutes;
      if (!day.entries.includes(s.entry)) day.entries.push(s.entry);
    }
    for (const note of filterNotes(entries, filter)) {
      if (note.date < from || note.date > to) continue;
      let day = byDay.get(note.date);
      if (!day) {
        day = { minutes: 0, entries: [] };
        byDay.set(note.date, day);
      }
      day.entries.push(note);
    }
    for (const day of byDay.values()) day.entries.sort((a, b) => a.createdAt - b.createdAt);
    return { days: [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0])), total };
  }, [entries, filter]);

  if (days.length === 0) {
    return <p className="journal-empty">No entries match these filters.</p>;
  }

  const shown = days.slice(0, pages * DAYS_PER_PAGE);

  return (
    <div className="journal-log">
      <p className="journal-muted journal-log-summary">
        {days.length} {days.length === 1 ? "day" : "days"}
        {total > 0 && ` · ${formatDuration(total)} logged`}
      </p>
      {shown.map(([date, day]) => (
        <section key={date} className="journal-day">
          <h3 className="journal-day-head">
            <span>{formatDayLong(date)}</span>
            <span>{day.minutes > 0 ? formatDuration(day.minutes) : ""}</span>
          </h3>
          <ul className="journal-entries">
            {day.entries.map((e) => (
              <EntryCard key={e.id} entry={e} catalog={catalog} onEdit={onEdit} />
            ))}
          </ul>
        </section>
      ))}
      {shown.length < days.length && (
        <button type="button" className="journal-link journal-more" onClick={() => setPages((p) => p + 1)}>
          Show older ({days.length - shown.length} more days)
        </button>
      )}
    </div>
  );
}
