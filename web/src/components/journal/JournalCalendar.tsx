import { useMemo, useState } from "react";
import { useJournal } from "../../store/useJournal";
import type { JournalEntry } from "../../types";
import {
  addDays,
  colorForSlot,
  filterSegments,
  formatDayLong,
  formatDuration,
  formatMonth,
  inRange,
  startOfWeek,
  toDateStr,
  todayStr,
  toSegments,
  WEEKDAYS,
  type ActivityInfo,
} from "../../lib/journal";
import EntryCard from "./EntryCard";
import { useMaskText } from "./useMaskText";

interface Props {
  catalog: ActivityInfo[];
  onEdit: (entry: JournalEntry) => void;
  onAdd: (date: string) => void;
}

interface DayCell {
  minutes: number;
  /** activity -> minutes, in catalog order for stable stacking */
  byActivity: [string, number][];
  entries: JournalEntry[];
}

const MAX_LINES = 3;

export default function JournalCalendar({ catalog, onEdit, onAdd }: Props) {
  const entries = useJournal((s) => s.entries);
  const filter = useJournal((s) => s.filter);
  const mask = useMaskText();
  const today = todayStr();
  const [cursor, setCursor] = useState(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }));
  const [selected, setSelected] = useState<string>(today);

  const monthStart = toDateStr(new Date(cursor.year, cursor.month, 1));
  const monthEnd = toDateStr(new Date(cursor.year, cursor.month + 1, 0));
  const gridStart = startOfWeek(monthStart);
  const gridEnd = addDays(startOfWeek(monthEnd), 6);

  const slotOf = useMemo(() => new Map(catalog.map((a) => [a.name, a.slot])), [catalog]);
  const order = useMemo(() => new Map(catalog.map((a, i) => [a.name, i])), [catalog]);

  const { cells, monthTotal, monthActive } = useMemo(() => {
    const segs = inRange(filterSegments(toSegments(entries), filter), gridStart, gridEnd);
    const tmp = new Map<string, { minutes: number; acts: Map<string, number>; entries: JournalEntry[] }>();
    let monthTotal = 0;
    const active = new Set<string>();
    for (const s of segs) {
      let c = tmp.get(s.date);
      if (!c) {
        c = { minutes: 0, acts: new Map(), entries: [] };
        tmp.set(s.date, c);
      }
      c.minutes += s.minutes;
      c.acts.set(s.activity, (c.acts.get(s.activity) ?? 0) + s.minutes);
      if (!c.entries.includes(s.entry)) c.entries.push(s.entry);
      if (s.date >= monthStart && s.date <= monthEnd) {
        monthTotal += s.minutes;
        active.add(s.date);
      }
    }
    const cells = new Map<string, DayCell>();
    for (const [date, c] of tmp) {
      cells.set(date, {
        minutes: c.minutes,
        byActivity: [...c.acts.entries()].sort((a, b) => (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0)),
        entries: c.entries,
      });
    }
    return { cells, monthTotal, monthActive: active.size };
  }, [entries, filter, gridStart, gridEnd, monthStart, monthEnd, order]);

  const weeks: string[][] = [];
  for (let w = gridStart; w <= gridEnd; w = addDays(w, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)));
  }

  const shiftMonth = (delta: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const selectedCell = cells.get(selected);

  return (
    <div className="journal-calendar">
      <div className="journal-cal-nav">
        <button type="button" className="icon-button" onClick={() => shiftMonth(-1)} title="Previous month">
          ‹
        </button>
        <h3>{formatMonth(cursor.year, cursor.month)}</h3>
        <button type="button" className="icon-button" onClick={() => shiftMonth(1)} title="Next month">
          ›
        </button>
        <button
          type="button"
          className="journal-link"
          onClick={() => {
            setCursor({ year: new Date().getFullYear(), month: new Date().getMonth() });
            setSelected(today);
          }}
        >
          Today
        </button>
        <span className="journal-muted journal-cal-summary">
          {formatDuration(monthTotal)} this month · {monthActive} active {monthActive === 1 ? "day" : "days"}
        </span>
      </div>

      <div className="journal-cal-grid" role="grid">
        {WEEKDAYS.map((d) => (
          <div key={d} className="journal-cal-weekday">
            {d}
          </div>
        ))}
        <div className="journal-cal-weekday">Week</div>

        {weeks.map((week) => {
          const weekTotal = week.reduce((sum, d) => sum + (cells.get(d)?.minutes ?? 0), 0);
          return [
            ...week.map((date) => {
              const cell = cells.get(date);
              const outside = date < monthStart || date > monthEnd;
              return (
                <button
                  key={date}
                  type="button"
                  role="gridcell"
                  className={[
                    "journal-cal-cell",
                    outside ? "outside" : "",
                    date === today ? "today" : "",
                    date === selected ? "selected" : "",
                  ].join(" ")}
                  onClick={() => setSelected(date)}
                  onDoubleClick={() => onAdd(date)}
                  title={cell ? `${formatDayLong(date)}: ${formatDuration(cell.minutes)}` : formatDayLong(date)}
                >
                  <span className="journal-cal-daynum">{Number(date.slice(8))}</span>
                  {cell && (
                    <>
                      <span className="journal-cal-total">{cell.minutes > 0 ? formatDuration(cell.minutes) : "✓"}</span>
                      {cell.minutes > 0 && (
                        <span className="journal-cal-stack">
                          {cell.byActivity
                            .filter(([, m]) => m > 0)
                            .map(([a, m]) => (
                              <span
                                key={a}
                                style={{ flexGrow: m, background: colorForSlot(slotOf.get(a) ?? -1) }}
                              />
                            ))}
                        </span>
                      )}
                      <span className="journal-cal-lines">
                        {cell.byActivity.slice(0, MAX_LINES).map(([a, m]) => (
                          <span key={a} className="journal-cal-line">
                            <span className="journal-dot" style={{ background: colorForSlot(slotOf.get(a) ?? -1) }} />
                            <span className="journal-cal-line-name">{mask(a)}</span>
                            {m > 0 && <span className="journal-cal-line-time">{formatDuration(m)}</span>}
                          </span>
                        ))}
                        {cell.byActivity.length > MAX_LINES && (
                          <span className="journal-muted">+{cell.byActivity.length - MAX_LINES} more</span>
                        )}
                      </span>
                    </>
                  )}
                </button>
              );
            }),
            <div key={`w-${week[0]}`} className="journal-cal-week">
              {weekTotal > 0 ? formatDuration(weekTotal) : ""}
            </div>,
          ];
        })}
      </div>

      <section className="journal-day journal-cal-detail">
        <h3 className="journal-day-head">
          <span>{formatDayLong(selected)}</span>
          <span>
            {selectedCell && formatDuration(selectedCell.minutes)}
            <button type="button" className="journal-link" onClick={() => onAdd(selected)}>
              + Log on this day
            </button>
          </span>
        </h3>
        {selectedCell ? (
          <ul className="journal-entries">
            {selectedCell.entries.map((e) => (
              <EntryCard key={e.id} entry={e} catalog={catalog} onEdit={onEdit} />
            ))}
          </ul>
        ) : (
          <p className="journal-muted">Nothing logged{filter.activities.length || filter.query ? " matching the filters" : ""}.</p>
        )}
      </section>
    </div>
  );
}
