import { useMemo, useState } from "react";
import { useJournal } from "../../store/useJournal";
import {
  bucketFor,
  bucketize,
  change,
  colorForSlot,
  computeStats,
  countingWindow,
  filterSegments,
  formatDayLong,
  formatDayShort,
  formatDuration,
  inRange,
  parseDateStr,
  previousWindow,
  toSegments,
  GENERAL_LABEL,
  OTHER_COLOR,
  WEEKDAYS,
  type ActivityInfo,
  type Avg,
  type Bucket,
  type CountingWindow,
  type GroupStats,
  type TimeBucket,
} from "../../lib/journal";
import { useMaskText } from "./useMaskText";

interface Props {
  catalog: ActivityInfo[];
}

type BucketChoice = "auto" | Bucket;

const BUCKETS: { value: BucketChoice; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

function windowLabel(w: { from: string; to: string }): string {
  if (w.from === w.to) return formatDayLong(w.from);
  const sameYear = w.from.slice(0, 4) === w.to.slice(0, 4);
  const from = sameYear ? formatDayShort(w.from) : `${formatDayShort(w.from)} ${w.from.slice(0, 4)}`;
  return `${from} – ${formatDayShort(w.to)} ${w.to.slice(0, 4)}`;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export default function JournalStatsView({ catalog }: Props) {
  const entries = useJournal((s) => s.entries);
  const filter = useJournal((s) => s.filter);
  const mask = useMaskText();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bucketChoice, setBucketChoice] = useState<BucketChoice>("auto");
  const [compare, setCompare] = useState(true);

  const data = useMemo(() => {
    const w = countingWindow(filter, entries);
    const filtered = filterSegments(toSegments(entries), filter);
    const segments = inRange(filtered, w.from, w.to);
    const stats = computeStats(segments, w);
    const pw = previousWindow(w);
    const prev = pw ? computeStats(inRange(filtered, pw.from, pw.to), pw) : null;
    return { w, pw, segments, stats, prev };
  }, [entries, filter]);

  const slotOf = useMemo(() => new Map(catalog.map((a) => [a.name, a.slot])), [catalog]);

  const { w, pw, stats, segments } = data;
  const prev = compare ? data.prev : null;
  const bucket: Bucket = bucketChoice === "auto" ? bucketFor(w.days) : bucketChoice;
  const buckets = useMemo(
    () => (w.days > 0 ? bucketize(segments, w.from, w.to, bucket) : []),
    [segments, w, bucket],
  );

  if (w.days === 0) {
    return (
      <p className="journal-empty">
        {w.trackingStart
          ? `Nothing to count: this range ends before your first entry (${formatDayLong(w.trackingStart)}).`
          : "Log some time to see stats."}
      </p>
    );
  }

  const prevByActivity = new Map(prev?.byActivity.map((a) => [a.activity, a]) ?? []);
  const top = stats.byActivity[0];

  const toggleExpanded = (activity: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(activity)) next.delete(activity);
      else next.add(activity);
      return next;
    });

  return (
    <div className="journal-stats">
      <div className="journal-stats-head">
        <p className="journal-muted">
          Counting <b>{windowLabel(w)}</b> · {w.days} {w.days === 1 ? "day" : "days"}
          {w.clippedStart && w.trackingStart && <> - from your first entry, not the start of the range</>}
        </p>
        <label className="journal-check">
          <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />
          Compare with previous {w.days} {w.days === 1 ? "day" : "days"}
          {compare && pw && <span className="journal-muted"> ({windowLabel(pw)})</span>}
          {compare && !pw && <span className="journal-muted"> (nothing tracked before)</span>}
        </label>
      </div>

      {stats.entries === 0 ? (
        <p className="journal-empty">No time logged in this range matches the filters.</p>
      ) : (
        <>
          <div className="journal-tiles">
            <Tile
              label="Total"
              value={formatDuration(stats.minutes)}
              sub={`${stats.entries} ${stats.entries === 1 ? "entry" : "entries"}`}
              delta={change(stats.minutes, prev?.minutes)}
            />
            <Tile
              label="Average per day"
              value={formatDuration(stats.all.perDay)}
              sub={w.days === 1 ? "1 day counted" : `over all ${w.days} days`}
              delta={change(stats.all.perDay, prev?.all.perDay)}
            />
            <Tile
              label="Average per logged day"
              value={formatDuration(stats.all.perLoggedDay)}
              sub={`${stats.all.loggedDays} of ${w.days} days logged (${pct(stats.all.loggedDays / w.days)})`}
              delta={change(stats.all.perLoggedDay, prev?.all.perLoggedDay)}
            />
            <Tile label="Per week" value={formatDuration(stats.perWeek)} sub="average 7-day total" delta={change(stats.perWeek, prev?.perWeek)} />
            <SplitTile label="Weekdays (Mon–Fri)" a={stats.weekday} prev={prev?.weekday} />
            <SplitTile label="Weekends (Sat–Sun)" a={stats.weekend} prev={prev?.weekend} />
            <Tile
              label="Streak"
              value={`${stats.currentStreak} ${stats.currentStreak === 1 ? "day" : "days"}`}
              sub={`longest ${stats.longestStreak} in this range`}
            />
            {stats.bestDay && (
              <Tile label="Best day" value={formatDuration(stats.bestDay.minutes)} sub={formatDayLong(stats.bestDay.date)} />
            )}
            {stats.longestEntry && (
              <Tile
                label="Longest entry"
                value={formatDuration(stats.longestEntry.minutes)}
                sub={`${mask(stats.longestEntry.entry.activity)} · ${formatDayShort(stats.longestEntry.entry.date)}`}
              />
            )}
            {top && top.minutes > 0 && (
              <Tile
                label="Most time on"
                value={mask(top.activity)}
                sub={`${pct(top.minutes / Math.max(1, stats.minutes))} · ${formatDuration(top.minutes)}`}
              />
            )}
          </div>

          {stats.minutes > 0 && (
            <section className="journal-panel">
              <div className="journal-panel-head">
                <h3>Time per {bucket}</h3>
                <div className="journal-segmented" role="radiogroup" aria-label="Group by">
                  {BUCKETS.map((b) => (
                    <button
                      key={b.value}
                      type="button"
                      role="radio"
                      aria-checked={bucketChoice === b.value}
                      className={bucketChoice === b.value ? "active" : ""}
                      onClick={() => setBucketChoice(b.value)}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
              <StackedBars buckets={buckets} bucket={bucket} slotOf={slotOf} catalog={catalog} mask={mask} w={w} />
            </section>
          )}

          <section className="journal-panel">
            <h3>By activity</h3>
            <div className="journal-table-wrap">
              <table className="journal-table">
                <thead>
                  <tr>
                    <th>Activity</th>
                    <th className="num">Total</th>
                    <th className="share">Share</th>
                    <th className="num" title="Total divided by every day in the range">Avg / day</th>
                    <th className="num" title="Total divided by the days you did it">Avg / logged day</th>
                    <th className="num" title="Per Mon–Fri day in the range">Weekday avg</th>
                    <th className="num" title="Per Sat–Sun day in the range">Weekend avg</th>
                    <th className="num">Days</th>
                    {prev && <th className="num">vs prev.</th>}
                  </tr>
                </thead>
                <tbody>
                  {stats.byActivity.map((a) => {
                    const color = colorForSlot(slotOf.get(a.activity) ?? -1);
                    const hasSubs = a.subs.some((s) => s.name !== null);
                    const open = expanded.has(a.activity);
                    const prevA = prevByActivity.get(a.activity);
                    return [
                      <tr
                        key={a.activity}
                        className={hasSubs ? "expandable" : ""}
                        onClick={() => hasSubs && toggleExpanded(a.activity)}
                      >
                        <td>
                          <span className="journal-dot" style={{ background: color }} />
                          {mask(a.activity)}
                          {hasSubs && <span className="journal-muted"> {open ? "▾" : "▸"}</span>}
                        </td>
                        <StatCells g={a} share={stats.minutes ? a.minutes / stats.minutes : 0} color={color} />
                        {prev && (
                          <td className="num">
                            <Delta value={change(a.minutes, prevA?.minutes)} isNew={!prevA} />
                          </td>
                        )}
                      </tr>,
                      ...(open
                        ? a.subs.map((s) => (
                            <tr key={`${a.activity}-${s.name ?? ""}`} className="journal-subrow">
                              <td>
                                {s.name === null ? <span className="journal-muted">{GENERAL_LABEL}</span> : mask(s.name)}
                              </td>
                              <StatCells g={s} share={a.minutes ? s.minutes / a.minutes : 0} color={color} />
                              {prev && (
                                <td className="num">
                                  <Delta
                                    value={change(s.minutes, prevA?.subs.find((p) => p.name === s.name)?.minutes)}
                                    isNew={!prevA?.subs.some((p) => p.name === s.name)}
                                  />
                                </td>
                              )}
                            </tr>
                          ))
                        : []),
                    ];
                  })}
                </tbody>
              </table>
            </div>
            <p className="journal-muted journal-footnote">
              Avg / day spreads the time over every counted day; avg / logged day only over the days you did it.
              Weekday and weekend averages are per Mon–Fri / Sat–Sun day in the range. Click an activity to break
              it down - sub-activity shares are of their activity's time.
            </p>
          </section>

          {stats.minutes > 0 && w.days >= 7 && (
            <section className="journal-panel">
              <h3>Average by weekday</h3>
              <WeekdayBars values={stats.weekdayAvg} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function StatCells({ g, share, color }: { g: GroupStats; share: number; color: string }) {
  return (
    <>
      <td className="num">{formatDuration(g.minutes)}</td>
      <td className="share">
        <ShareBar share={share} color={color} />
      </td>
      <td className="num">{formatDuration(g.all.perDay)}</td>
      <td className="num">{formatDuration(g.all.perLoggedDay)}</td>
      <td className="num">{formatDuration(g.weekday.perDay)}</td>
      <td className="num">{formatDuration(g.weekend.perDay)}</td>
      <td className="num">{g.all.loggedDays}</td>
    </>
  );
}

/** Up = more time. Shown with an arrow and sign, never color alone. */
function Delta({ value, isNew }: { value: number | null; isNew?: boolean }) {
  if (value === null) return <span className="journal-muted">{isNew ? "new" : "–"}</span>;
  const rounded = Math.round(value * 100);
  if (rounded === 0) return <span className="journal-delta flat">±0%</span>;
  return (
    <span className={`journal-delta ${rounded > 0 ? "up" : "down"}`}>
      {rounded > 0 ? "▲ +" : "▼ "}
      {rounded}%
    </span>
  );
}

function Tile({ label, value, sub, delta }: { label: string; value: string; sub?: string; delta?: number | null }) {
  return (
    <div className="journal-tile">
      <span className="journal-tile-label">{label}</span>
      <span className="journal-tile-value">{value}</span>
      {sub && <span className="journal-tile-sub">{sub}</span>}
      {delta !== undefined && delta !== null && (
        <span className="journal-tile-delta">
          <Delta value={delta} /> <span className="journal-muted">vs prev.</span>
        </span>
      )}
    </div>
  );
}

function SplitTile({ label, a, prev }: { label: string; a: Avg; prev?: Avg }) {
  return (
    <Tile
      label={label}
      value={a.days ? formatDuration(a.perDay) : "–"}
      sub={
        a.days
          ? `per day · ${formatDuration(a.perLoggedDay)} per logged day · ${a.loggedDays}/${a.days} logged`
          : "none in this range"
      }
      delta={a.days ? change(a.perDay, prev?.perDay) : null}
    />
  );
}

function ShareBar({ share, color }: { share: number; color: string }) {
  return (
    <span className="journal-share">
      <span className="journal-share-track">
        <span className="journal-share-fill" style={{ width: `${share * 100}%`, background: color }} />
      </span>
      <span className="journal-share-pct">{pct(share)}</span>
    </span>
  );
}

/** Rounds the axis max up to a readable hour step, 4 gridlines or fewer. */
function niceScale(maxMinutes: number): { max: number; step: number } {
  const hours = Math.max(maxMinutes / 60, 0.25);
  const steps = [0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 24, 48, 72, 120, 240, 480, 1000, 2000, 5000];
  const step = steps.find((s) => hours / s <= 4) ?? Math.ceil(hours / 4);
  return { max: Math.ceil(hours / step) * step * 60, step: step * 60 };
}

function bucketLabel(start: string, bucket: Bucket): string {
  if (bucket === "year") return start.slice(0, 4);
  if (bucket === "month") {
    return parseDateStr(start).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }
  return formatDayShort(start);
}

function bucketTitle(start: string, bucket: Bucket): string {
  if (bucket === "day") return formatDayLong(start);
  if (bucket === "week") return `Week of ${formatDayShort(start)}`;
  if (bucket === "month") return parseDateStr(start).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return start.slice(0, 4);
}

interface StackedProps {
  buckets: TimeBucket[];
  bucket: Bucket;
  slotOf: Map<string, number>;
  catalog: ActivityInfo[];
  mask: (s: string) => string;
  w: CountingWindow;
}

const OTHER = "\u0000other";

/**
 * Stacked columns, one per day/week/month/year. Activities past the eighth
 * color slot fold into a single gray "Other" series rather than reusing a
 * hue - identity must never depend on color alone or be ambiguous.
 */
function StackedBars({ buckets, bucket, slotOf, catalog, mask, w }: StackedProps) {
  const [hover, setHover] = useState<number | null>(null);
  const { max, step } = niceScale(Math.max(...buckets.map((b) => b.total)));

  const seriesKey = (a: string) => ((slotOf.get(a) ?? -1) >= 0 ? a : OTHER);
  const present = new Set<string>();
  for (const b of buckets) for (const [a, m] of b.byActivity) if (m > 0) present.add(seriesKey(a));
  const series = [
    ...catalog
      .filter((a) => a.slot >= 0 && present.has(a.name))
      .map((a) => ({ key: a.name, color: colorForSlot(a.slot), label: mask(a.name) })),
    ...(present.has(OTHER) ? [{ key: OTHER, color: OTHER_COLOR, label: "Other" }] : []),
  ];

  const stackOf = (b: TimeBucket) => {
    const sums = new Map<string, number>();
    for (const [a, m] of b.byActivity) sums.set(seriesKey(a), (sums.get(seriesKey(a)) ?? 0) + m);
    return series.map((s) => ({ ...s, minutes: sums.get(s.key) ?? 0 })).filter((s) => s.minutes > 0);
  };

  const ticks: number[] = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);
  const labelEvery = Math.ceil(buckets.length / 10);
  const hovered = hover !== null ? buckets[hover] : null;
  const avgPerBucket = buckets.length ? buckets.reduce((s, b) => s + b.total, 0) / buckets.length : 0;

  return (
    <div className="journal-chart">
      {series.length > 1 && (
        <div className="journal-legend">
          {series.map((s) => (
            <span key={s.key}>
              <span className="journal-dot" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div className="journal-chart-body">
        <div className="journal-chart-yaxis">
          {ticks.map((t) => (
            <span key={t} style={{ bottom: `${(t / max) * 100}%` }}>
              {t === 0 ? "0" : formatDuration(t)}
            </span>
          ))}
        </div>
        <div className="journal-chart-plot" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <span key={t} className="journal-chart-grid" style={{ bottom: `${(t / max) * 100}%` }} />
          ))}
          {buckets.length > 1 && avgPerBucket > 0 && (
            <span
              className="journal-chart-avg"
              style={{ bottom: `${(avgPerBucket / max) * 100}%` }}
              title={`Average per ${bucket}: ${formatDuration(avgPerBucket)}`}
            >
              <span>avg {formatDuration(avgPerBucket)}</span>
            </span>
          )}
          <div className="journal-chart-cols">
            {buckets.map((b, i) => (
              <div
                key={b.start}
                className={`journal-chart-col ${hover === i ? "hover" : ""}`}
                onMouseEnter={() => setHover(i)}
              >
                <div className="journal-chart-stack" style={{ height: `${(b.total / max) * 100}%` }}>
                  {stackOf(b).map((s) => (
                    <span key={s.key} style={{ flexGrow: s.minutes, background: s.color }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          {hovered && hover !== null && (
            <div
              className="journal-tooltip"
              style={{
                left: `${((hover + 0.5) / buckets.length) * 100}%`,
                transform: `translateX(${hover > buckets.length / 2 ? "-100%" : "0"})`,
              }}
            >
              <strong>{bucketTitle(hovered.start, bucket)}</strong>
              <span className="journal-tooltip-total">{formatDuration(hovered.total)}</span>
              {stackOf(hovered)
                .slice()
                .reverse()
                .map((s) => (
                  <span key={s.key} className="journal-tooltip-row">
                    <span className="journal-dot" style={{ background: s.color }} />
                    {s.label}
                    <b>{formatDuration(s.minutes)}</b>
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>
      <div className="journal-chart-xaxis">
        {buckets.map((b, i) => (
          <span key={b.start}>{i % labelEvery === 0 ? bucketLabel(b.start < w.from ? w.from : b.start, bucket) : ""}</span>
        ))}
      </div>
    </div>
  );
}

function WeekdayBars({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="journal-weekdays">
      {values.map((v, i) => (
        <div
          key={WEEKDAYS[i]}
          className={`journal-weekday ${i >= 5 ? "weekend" : ""}`}
          title={`${WEEKDAYS[i]}: ${formatDuration(v)} on average`}
        >
          <span className="journal-weekday-value">{v > 0 ? formatDuration(v) : ""}</span>
          <span className="journal-weekday-track">
            <span className="journal-weekday-fill" style={{ height: `${(v / max) * 100}%` }} />
          </span>
          <span className="journal-weekday-label">{WEEKDAYS[i]}</span>
        </div>
      ))}
    </div>
  );
}
