import { useMemo, useState } from "react";
import { useJournal } from "../../store/useJournal";
import {
  bucketFor,
  bucketize,
  colorForSlot,
  computeStats,
  filterSegments,
  formatDayShort,
  formatDuration,
  inRange,
  parseDateStr,
  resolveRange,
  toSegments,
  GENERAL_LABEL,
  OTHER_COLOR,
  WEEKDAYS,
  type ActivityInfo,
  type Bucket,
  type TimeBucket,
} from "../../lib/journal";
import { useMaskText } from "./useMaskText";

interface Props {
  catalog: ActivityInfo[];
}

export default function JournalStatsView({ catalog }: Props) {
  const entries = useJournal((s) => s.entries);
  const filter = useJournal((s) => s.filter);
  const mask = useMaskText();
  const [expanded, setExpanded] = useState<string | null>(null);

  const { from, to, stats, buckets, bucket } = useMemo(() => {
    const { from, to } = resolveRange(filter, entries);
    const segments = inRange(filterSegments(toSegments(entries), filter), from, to);
    const stats = computeStats(segments, from, to);
    const bucket = bucketFor(stats.rangeDays);
    return { from, to, stats, bucket, buckets: bucketize(segments, from, to, bucket) };
  }, [entries, filter]);

  const slotOf = useMemo(() => new Map(catalog.map((a) => [a.name, a.slot])), [catalog]);

  if (stats.entries === 0) {
    return <p className="journal-empty">No entries in this range match the filters.</p>;
  }

  const rangeLabel = `${formatDayShort(from)} – ${formatDayShort(to)} ${to.slice(0, 4)}`;
  const top = stats.byActivity[0];

  return (
    <div className="journal-stats">
      <p className="journal-muted">
        {rangeLabel} · {stats.rangeDays} {stats.rangeDays === 1 ? "day" : "days"}
      </p>

      <div className="journal-tiles">
        <Tile label="Total" value={formatDuration(stats.totalMinutes)} sub={`${stats.entries} entries`} />
        <Tile label="Average per day" value={formatDuration(stats.avgPerDay)} sub={`over all ${stats.rangeDays} days`} />
        <Tile
          label="Average per active day"
          value={formatDuration(stats.avgPerActiveDay)}
          sub={`${stats.activeDays} of ${stats.rangeDays} days active`}
        />
        <Tile
          label="Streak"
          value={`${stats.currentStreak} ${stats.currentStreak === 1 ? "day" : "days"}`}
          sub={`longest ${stats.longestStreak}`}
        />
        {top && top.minutes > 0 && (
          <Tile
            label="Most time on"
            value={mask(top.activity)}
            sub={`${Math.round((top.minutes / Math.max(1, stats.totalMinutes)) * 100)}% · ${formatDuration(top.minutes)}`}
          />
        )}
      </div>

      {stats.totalMinutes > 0 && (
        <section className="journal-panel">
          <h3>Time per {bucket}</h3>
          <StackedBars buckets={buckets} bucket={bucket} slotOf={slotOf} catalog={catalog} mask={mask} />
        </section>
      )}

      <section className="journal-panel">
        <h3>By activity</h3>
        <table className="journal-table">
          <thead>
            <tr>
              <th>Activity</th>
              <th className="num">Total</th>
              <th className="share">Share</th>
              <th className="num">Avg / day</th>
              <th className="num">Avg / session day</th>
              <th className="num">Days</th>
            </tr>
          </thead>
          <tbody>
            {stats.byActivity.map((a) => {
              const share = stats.totalMinutes ? a.minutes / stats.totalMinutes : 0;
              const color = colorForSlot(slotOf.get(a.activity) ?? -1);
              const hasSubs = a.subs.some((s) => s.name !== null);
              const open = expanded === a.activity;
              return [
                <tr
                  key={a.activity}
                  className={hasSubs ? "expandable" : ""}
                  onClick={() => hasSubs && setExpanded(open ? null : a.activity)}
                >
                  <td>
                    <span className="journal-dot" style={{ background: color }} />
                    {mask(a.activity)}
                    {hasSubs && <span className="journal-muted"> {open ? "▾" : "▸"}</span>}
                  </td>
                  <td className="num">{formatDuration(a.minutes)}</td>
                  <td className="share">
                    <ShareBar share={share} color={color} />
                  </td>
                  <td className="num">{formatDuration(a.minutes / stats.rangeDays)}</td>
                  <td className="num">{formatDuration(a.minutes / Math.max(1, a.days))}</td>
                  <td className="num">{a.days}</td>
                </tr>,
                ...(open
                  ? a.subs.map((s) => (
                      <tr key={`${a.activity}-${s.name ?? ""}`} className="journal-subrow">
                        <td>{s.name === null ? <span className="journal-muted">{GENERAL_LABEL}</span> : mask(s.name)}</td>
                        <td className="num">{formatDuration(s.minutes)}</td>
                        <td className="share">
                          <ShareBar share={a.minutes ? s.minutes / a.minutes : 0} color={color} />
                        </td>
                        <td className="num">{formatDuration(s.minutes / stats.rangeDays)}</td>
                        <td className="num">{formatDuration(s.minutes / Math.max(1, s.days))}</td>
                        <td className="num">{s.days}</td>
                      </tr>
                    ))
                  : []),
              ];
            })}
          </tbody>
        </table>
        <p className="journal-muted journal-footnote">
          Avg / day spreads the time over every day in the range; avg / session day only over the days you did it.
          Sub-activity shares are of their activity's time.
        </p>
      </section>

      {stats.totalMinutes > 0 && stats.rangeDays >= 7 && (
        <section className="journal-panel">
          <h3>Average by weekday</h3>
          <WeekdayBars values={stats.weekdayAvg} />
        </section>
      )}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="journal-tile">
      <span className="journal-tile-label">{label}</span>
      <span className="journal-tile-value">{value}</span>
      {sub && <span className="journal-tile-sub">{sub}</span>}
    </div>
  );
}

function ShareBar({ share, color }: { share: number; color: string }) {
  return (
    <span className="journal-share">
      <span className="journal-share-track">
        <span className="journal-share-fill" style={{ width: `${share * 100}%`, background: color }} />
      </span>
      <span className="journal-share-pct">{Math.round(share * 100)}%</span>
    </span>
  );
}

/** Rounds the axis max up to a readable hour step, 4 gridlines or fewer. */
function niceScale(maxMinutes: number): { max: number; step: number } {
  const hours = Math.max(maxMinutes / 60, 0.25);
  const steps = [0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 24, 48, 72, 120, 240, 480];
  const step = steps.find((s) => hours / s <= 4) ?? Math.ceil(hours / 4);
  return { max: Math.ceil(hours / step) * step * 60, step: step * 60 };
}

function bucketLabel(start: string, bucket: Bucket): string {
  if (bucket === "month") {
    return parseDateStr(start).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  }
  return formatDayShort(start);
}

interface StackedProps {
  buckets: TimeBucket[];
  bucket: Bucket;
  slotOf: Map<string, number>;
  catalog: ActivityInfo[];
  mask: (s: string) => string;
}

const OTHER = "\u0000other";

/**
 * Stacked columns, one per day/week/month. Activities past the eighth
 * color slot fold into a single gray "Other" series rather than reusing a
 * hue - identity must never depend on color alone or be ambiguous.
 */
function StackedBars({ buckets, bucket, slotOf, catalog, mask }: StackedProps) {
  const [hover, setHover] = useState<number | null>(null);
  const { max, step } = niceScale(Math.max(...buckets.map((b) => b.total)));

  const seriesKey = (a: string) => ((slotOf.get(a) ?? -1) >= 0 ? a : OTHER);
  const present = new Set<string>();
  for (const b of buckets) for (const [a, m] of b.byActivity) if (m > 0) present.add(seriesKey(a));
  const series = [
    ...catalog.filter((a) => a.slot >= 0 && present.has(a.name)).map((a) => ({ key: a.name, color: colorForSlot(a.slot), label: mask(a.name) })),
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
              <strong>
                {bucket === "day" ? formatDayShort(hovered.start) : `${bucket === "week" ? "Week of " : ""}${bucketLabel(hovered.start, bucket)}`}
              </strong>
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
          <span key={b.start}>{i % labelEvery === 0 ? bucketLabel(b.start, bucket) : ""}</span>
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
        <div key={WEEKDAYS[i]} className="journal-weekday" title={`${WEEKDAYS[i]}: ${formatDuration(v)} on average`}>
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
