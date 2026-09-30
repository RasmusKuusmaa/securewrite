import type { JournalEntry } from "../types";

// Pure helpers behind the journal views: local-date math, duration
// parsing/formatting, filtering and statistics. Kept free of React/store
// imports so every view computes numbers the same way.

// ---------------------------------------------------------------- dates

/** YYYY-MM-DD in local time - journal days are calendar days where you are,
 * not UTC days, so 23:30 work never lands on "tomorrow". */
export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayStr(): string {
  return toDateStr(new Date());
}

export function addDays(s: string, n: number): string {
  const d = parseDateStr(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** Inclusive day count, DST-proof (compares UTC midnights). */
export function daysInclusive(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000) + 1;
}

/** Monday-based weekday, 0 = Mon ... 6 = Sun. */
export function weekdayIndex(s: string): number {
  return (parseDateStr(s).getDay() + 6) % 7;
}

export function startOfWeek(s: string): string {
  return addDays(s, -weekdayIndex(s));
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function formatDayLong(s: string): string {
  return parseDateStr(s).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDayShort(s: string): string {
  return parseDateStr(s).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function formatMonth(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

// ------------------------------------------------------------ durations

const HM_RE = /^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+(?:\.\d+)?)\s*(?:m(?:in(?:ute)?s?)?)?)?$/;

/**
 * Accepts "3", "1.5" (hours), "1:30", "1h30m", "1h 30", "90m", "45 min".
 * A bare number means hours. Returns minutes, or null if unparseable
 * (empty input also returns null so callers can tell "blank" from "0").
 */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase().replace(",", ".");
  if (!s) return null;
  const colon = s.match(/^(\d+):(\d{1,2})$/);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 60);
  const hm = s.match(HM_RE);
  if (hm && (hm[1] !== undefined || hm[2] !== undefined)) {
    return Math.round(Number(hm[1] ?? 0) * 60 + Number(hm[2] ?? 0));
  }
  return null;
}

export function formatDuration(minutes: number): string {
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ------------------------------------------------------------- segments

/**
 * Every entry flattened into the slices stats are computed over: one per
 * breakdown part, plus a `sub: null` "general" slice for any unallocated
 * remainder (or the whole entry, when it has no breakdown - including
 * zero-minute "done it" entries like a gym session logged without a time).
 */
export interface Segment {
  entry: JournalEntry;
  date: string;
  activity: string;
  sub: string | null;
  minutes: number;
}

export function toSegments(entries: JournalEntry[]): Segment[] {
  const out: Segment[] = [];
  for (const entry of entries) {
    let allocated = 0;
    for (const part of entry.parts) {
      allocated += part.minutes;
      out.push({ entry, date: entry.date, activity: entry.activity, sub: part.name, minutes: part.minutes });
    }
    const rest = entry.minutes - allocated;
    if (rest > 0 || entry.parts.length === 0) {
      out.push({ entry, date: entry.date, activity: entry.activity, sub: null, minutes: Math.max(0, rest) });
    }
  }
  return out;
}

export const GENERAL_LABEL = "general";

/** Filter key for a sub-activity; `sub: null` is the activity's general time. */
export function subKey(activity: string, sub: string | null): string {
  return `${activity}\u001f${sub ?? ""}`;
}

// -------------------------------------------------------------- filters

export type RangePreset = "7d" | "30d" | "90d" | "week" | "month" | "year" | "all" | "custom";

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom" },
];

export interface JournalFilter {
  range: RangePreset;
  /** Only used when range is "custom". */
  from: string;
  to: string;
  /** Empty = every activity. */
  activities: string[];
  /** subKey()s. Narrows only the activities they belong to. */
  subs: string[];
  query: string;
}

export function defaultFilter(): JournalFilter {
  const today = todayStr();
  return { range: "30d", from: addDays(today, -29), to: today, activities: [], subs: [], query: "" };
}

export function resolveRange(filter: JournalFilter, entries: JournalEntry[]): { from: string; to: string } {
  const today = todayStr();
  switch (filter.range) {
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "90d":
      return { from: addDays(today, -89), to: today };
    case "week":
      return { from: startOfWeek(today), to: today };
    case "month":
      return { from: today.slice(0, 8) + "01", to: today };
    case "year":
      return { from: today.slice(0, 5) + "01-01", to: today };
    case "all": {
      if (entries.length === 0) return { from: today, to: today };
      let min = entries[0].date;
      let max = entries[0].date;
      for (const e of entries) {
        if (e.date < min) min = e.date;
        if (e.date > max) max = e.date;
      }
      return { from: min, to: max > today ? max : today };
    }
    case "custom":
      return filter.from <= filter.to ? { from: filter.from, to: filter.to } : { from: filter.to, to: filter.from };
  }
}

function entryMatchesQuery(entry: JournalEntry, q: string): boolean {
  if (!q) return true;
  if (entry.note.toLowerCase().includes(q) || entry.activity.toLowerCase().includes(q)) return true;
  return entry.parts.some((p) => p.name.toLowerCase().includes(q));
}

/**
 * Everything except the date range - the calendar applies its own month
 * window on top of this, the log and stats add resolveRange()'s window.
 */
export function filterSegments(segments: Segment[], filter: JournalFilter): Segment[] {
  const q = filter.query.trim().toLowerCase();
  const acts = new Set(filter.activities);
  const subs = new Set(filter.subs);
  const narrowed = new Set(filter.subs.map((k) => k.split("\u001f")[0]));
  return segments.filter((s) => {
    if (acts.size > 0 && !acts.has(s.activity)) return false;
    if (narrowed.has(s.activity) && !subs.has(subKey(s.activity, s.sub))) return false;
    return entryMatchesQuery(s.entry, q);
  });
}

export function inRange(segments: Segment[], from: string, to: string): Segment[] {
  return segments.filter((s) => s.date >= from && s.date <= to);
}

export function isFilterNarrowed(filter: JournalFilter): boolean {
  return filter.activities.length > 0 || filter.subs.length > 0 || filter.query.trim() !== "";
}

// --------------------------------------------------------------- catalog

export interface ActivityInfo {
  name: string;
  /** Sub-activity names ever used under it, most-used first. */
  subs: string[];
  /** Fixed categorical slot (0-7) by first use, or -1 past the eighth. */
  slot: number;
}

/**
 * Activities are defined implicitly by what's been logged. Color slots are
 * assigned by first use (earliest date, then creation) - so an activity's
 * color never changes when filters or totals change.
 */
export function buildCatalog(entries: JournalEntry[]): ActivityInfo[] {
  const first = new Map<string, [string, number]>();
  const subUse = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const seen = first.get(e.activity);
    if (!seen || e.date < seen[0] || (e.date === seen[0] && e.createdAt < seen[1])) {
      first.set(e.activity, [e.date, e.createdAt]);
    }
    const counts = subUse.get(e.activity) ?? new Map<string, number>();
    for (const p of e.parts) counts.set(p.name, (counts.get(p.name) ?? 0) + p.minutes);
    subUse.set(e.activity, counts);
  }
  return [...first.entries()]
    .sort((a, b) => a[1][0].localeCompare(b[1][0]) || a[1][1] - b[1][1])
    .map(([name], i) => ({
      name,
      slot: i < SERIES_COLORS.length ? i : -1,
      subs: [...(subUse.get(name) ?? new Map()).entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n),
    }));
}

/** Validated categorical order (dataviz reference palette, light surface). */
export const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
export const OTHER_COLOR = "#898781";

export function colorForSlot(slot: number): string {
  return slot >= 0 ? SERIES_COLORS[slot] : OTHER_COLOR;
}

// ----------------------------------------------------------------- stats

export interface SubStat {
  name: string | null;
  minutes: number;
  days: number;
}

export interface ActivityStat {
  activity: string;
  minutes: number;
  days: number;
  entries: number;
  subs: SubStat[];
}

export interface JournalStats {
  totalMinutes: number;
  rangeDays: number;
  activeDays: number;
  entries: number;
  avgPerDay: number;
  avgPerActiveDay: number;
  byActivity: ActivityStat[];
  /** Average minutes per Mon..Sun over the range's occurrences of that weekday. */
  weekdayAvg: number[];
  longestStreak: number;
  /** Consecutive active days ending at the range end (or the day before it,
   * so an empty "today" doesn't zero a running streak). */
  currentStreak: number;
}

export function computeStats(segments: Segment[], from: string, to: string): JournalStats {
  const rangeDays = Math.max(1, daysInclusive(from, to));
  const activeDates = new Set<string>();
  const entryIds = new Set<string>();
  const acts = new Map<string, { minutes: number; dates: Set<string>; entries: Set<string>; subs: Map<string, { minutes: number; dates: Set<string> }> }>();
  const weekdaySum = [0, 0, 0, 0, 0, 0, 0];
  let totalMinutes = 0;

  for (const s of segments) {
    totalMinutes += s.minutes;
    activeDates.add(s.date);
    entryIds.add(s.entry.id);
    weekdaySum[weekdayIndex(s.date)] += s.minutes;
    let a = acts.get(s.activity);
    if (!a) {
      a = { minutes: 0, dates: new Set(), entries: new Set(), subs: new Map() };
      acts.set(s.activity, a);
    }
    a.minutes += s.minutes;
    a.dates.add(s.date);
    a.entries.add(s.entry.id);
    const key = s.sub ?? "";
    let sub = a.subs.get(key);
    if (!sub) {
      sub = { minutes: 0, dates: new Set() };
      a.subs.set(key, sub);
    }
    sub.minutes += s.minutes;
    sub.dates.add(s.date);
  }

  // How many Mondays, Tuesdays, ... the range actually contains.
  const weekdayCount = [0, 0, 0, 0, 0, 0, 0];
  const firstWd = weekdayIndex(from);
  for (let i = 0; i < 7; i++) {
    weekdayCount[(firstWd + i) % 7] = Math.floor(rangeDays / 7) + (i < rangeDays % 7 ? 1 : 0);
  }

  let longestStreak = 0;
  let run = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    run = activeDates.has(d) ? run + 1 : 0;
    longestStreak = Math.max(longestStreak, run);
  }
  let currentStreak = 0;
  let d = activeDates.has(to) ? to : addDays(to, -1);
  while (d >= from && activeDates.has(d)) {
    currentStreak++;
    d = addDays(d, -1);
  }

  const byActivity: ActivityStat[] = [...acts.entries()]
    .map(([activity, a]) => ({
      activity,
      minutes: a.minutes,
      days: a.dates.size,
      entries: a.entries.size,
      subs: [...a.subs.entries()]
        .map(([name, s]) => ({ name: name || null, minutes: s.minutes, days: s.dates.size }))
        .sort((x, y) => y.minutes - x.minutes),
    }))
    .sort((x, y) => y.minutes - x.minutes || y.days - x.days);

  return {
    totalMinutes,
    rangeDays,
    activeDays: activeDates.size,
    entries: entryIds.size,
    avgPerDay: totalMinutes / rangeDays,
    avgPerActiveDay: activeDates.size ? totalMinutes / activeDates.size : 0,
    byActivity,
    weekdayAvg: weekdaySum.map((sum, i) => (weekdayCount[i] ? sum / weekdayCount[i] : 0)),
    longestStreak,
    currentStreak,
  };
}

export type Bucket = "day" | "week" | "month";

export function bucketFor(rangeDays: number): Bucket {
  if (rangeDays <= 62) return "day";
  if (rangeDays <= 366) return "week";
  return "month";
}

export function bucketStart(date: string, bucket: Bucket): string {
  if (bucket === "day") return date;
  if (bucket === "week") return startOfWeek(date);
  return date.slice(0, 8) + "01";
}

function nextBucket(start: string, bucket: Bucket): string {
  if (bucket === "day") return addDays(start, 1);
  if (bucket === "week") return addDays(start, 7);
  const d = parseDateStr(start);
  d.setMonth(d.getMonth() + 1);
  return toDateStr(d);
}

export interface TimeBucket {
  start: string;
  total: number;
  byActivity: Map<string, number>;
}

/** Every bucket in the range, empty ones included, so gaps show as gaps. */
export function bucketize(segments: Segment[], from: string, to: string, bucket: Bucket): TimeBucket[] {
  const buckets: TimeBucket[] = [];
  const index = new Map<string, TimeBucket>();
  for (let s = bucketStart(from, bucket); s <= to; s = nextBucket(s, bucket)) {
    const b = { start: s, total: 0, byActivity: new Map<string, number>() };
    buckets.push(b);
    index.set(s, b);
  }
  for (const seg of segments) {
    const b = index.get(bucketStart(seg.date, bucket));
    if (!b) continue;
    b.total += seg.minutes;
    b.byActivity.set(seg.activity, (b.byActivity.get(seg.activity) ?? 0) + seg.minutes);
  }
  return buckets;
}
