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
 * Journal notes have no time and produce no segments.
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
    if (entry.kind === "note") continue;
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

export type RangePreset =
  | "today"
  | "yesterday"
  | "week"
  | "lastweek"
  | "7d"
  | "month"
  | "lastmonth"
  | "30d"
  | "90d"
  | "year"
  | "lastyear"
  | "365d"
  | "all"
  | "custom";

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "This week" },
  { value: "lastweek", label: "Last week" },
  { value: "7d", label: "Last 7 days" },
  { value: "month", label: "This month" },
  { value: "lastmonth", label: "Last month" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "year", label: "This year" },
  { value: "lastyear", label: "Last year" },
  { value: "365d", label: "Last 365 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];

/** Which entry types the log/calendar show. Stats always use time entries. */
export type ShowKind = "all" | "time" | "note";

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
  show: ShowKind;
}

export const DEFAULT_RANGE: RangePreset = "30d";

export function defaultFilter(): JournalFilter {
  const today = todayStr();
  return { range: DEFAULT_RANGE, from: addDays(today, -29), to: today, activities: [], subs: [], query: "", show: "all" };
}

/** First day of the month `offset` months from the one containing `date`. */
function monthStart(date: string, offset = 0): string {
  const d = parseDateStr(date);
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + offset, 1));
}

export function resolveRange(filter: JournalFilter, entries: JournalEntry[]): { from: string; to: string } {
  const today = todayStr();
  switch (filter.range) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "week":
      return { from: startOfWeek(today), to: today };
    case "lastweek":
      return { from: addDays(startOfWeek(today), -7), to: addDays(startOfWeek(today), -1) };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "month":
      return { from: monthStart(today), to: today };
    case "lastmonth":
      return { from: monthStart(today, -1), to: addDays(monthStart(today), -1) };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "90d":
      return { from: addDays(today, -89), to: today };
    case "year":
      return { from: today.slice(0, 5) + "01-01", to: today };
    case "lastyear": {
      const y = Number(today.slice(0, 4)) - 1;
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    case "365d":
      return { from: addDays(today, -364), to: today };
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

/**
 * The days averages are divided by: the selected range, but never before
 * the first day anything was tracked (so starting yesterday doesn't spread
 * yesterday's 4h over 30 empty days) and never past today (future days
 * haven't happened yet). `days` is 0 when the range lies wholly outside.
 */
export interface CountingWindow {
  from: string;
  to: string;
  days: number;
  /** The range as selected, before clipping. */
  rangeFrom: string;
  rangeTo: string;
  /** First day with a time entry, across everything (filters ignored). */
  trackingStart: string | null;
  clippedStart: boolean;
}

export function countingWindow(filter: JournalFilter, entries: JournalEntry[]): CountingWindow {
  const range = resolveRange(filter, entries);
  return clipWindow(range.from, range.to, trackingStartOf(entries));
}

export function trackingStartOf(entries: JournalEntry[]): string | null {
  let first: string | null = null;
  for (const e of entries) if (e.kind !== "note" && (first === null || e.date < first)) first = e.date;
  return first;
}

function clipWindow(rangeFrom: string, rangeTo: string, trackingStart: string | null): CountingWindow {
  const today = todayStr();
  const from = trackingStart && trackingStart > rangeFrom ? trackingStart : rangeFrom;
  const to = rangeTo > today ? today : rangeTo;
  const days = trackingStart === null || from > to ? 0 : daysInclusive(from, to);
  return { from, to, days, rangeFrom, rangeTo, trackingStart, clippedStart: from !== rangeFrom };
}

/** The equally long stretch right before `w`, clipped the same way - for
 * "vs previous period" deltas. Null when tracking hadn't started yet. */
export function previousWindow(w: CountingWindow): CountingWindow | null {
  if (w.days === 0) return null;
  const prevTo = addDays(w.from, -1);
  const prev = clipWindow(addDays(prevTo, -(w.days - 1)), prevTo, w.trackingStart);
  return prev.days > 0 ? prev : null;
}

function entryMatchesQuery(entry: JournalEntry, q: string): boolean {
  if (!q) return true;
  if (entry.note.toLowerCase().includes(q) || entry.activity.toLowerCase().includes(q)) return true;
  if (entry.title.toLowerCase().includes(q)) return true;
  return entry.parts.some((p) => p.name.toLowerCase().includes(q));
}

/**
 * Everything except the date range - the calendar applies its own month
 * window on top of this, the log and stats add resolveRange()'s window.
 */
export function filterSegments(segments: Segment[], filter: JournalFilter): Segment[] {
  if (filter.show === "note") return [];
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

/** Journal notes the log/calendar should show. Notes have no activity, so
 * any activity filter hides them - that filter asks about time spent. */
export function filterNotes(entries: JournalEntry[], filter: JournalFilter): JournalEntry[] {
  if (filter.show === "time" || filter.activities.length > 0 || filter.subs.length > 0) return [];
  const q = filter.query.trim().toLowerCase();
  return entries.filter((e) => e.kind === "note" && entryMatchesQuery(e, q));
}

export function inRange(segments: Segment[], from: string, to: string): Segment[] {
  return segments.filter((s) => s.date >= from && s.date <= to);
}

export function isFilterNarrowed(filter: JournalFilter): boolean {
  return filter.activities.length > 0 || filter.subs.length > 0 || filter.query.trim() !== "" || filter.show !== "all";
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
    if (e.kind === "note") continue;
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

export function isWeekend(date: string): boolean {
  return weekdayIndex(date) >= 5;
}

/** How many of each weekday (Mon..Sun) a window contains. */
function weekdayCounts(from: string, days: number): number[] {
  const counts = [0, 0, 0, 0, 0, 0, 0];
  const first = weekdayIndex(from);
  for (let i = 0; i < 7; i++) counts[(first + i) % 7] = Math.floor(days / 7) + (i < days % 7 ? 1 : 0);
  return counts;
}

/** Averages over a set of calendar days, and over just the days with data. */
export interface Avg {
  minutes: number;
  days: number;
  loggedDays: number;
  /** minutes per calendar day in the group */
  perDay: number;
  /** minutes per logged day in the group */
  perLoggedDay: number;
}

function avg(minutes: number, days: number, loggedDays: number): Avg {
  return {
    minutes,
    days,
    loggedDays,
    perDay: days ? minutes / days : 0,
    perLoggedDay: loggedDays ? minutes / loggedDays : 0,
  };
}

interface Tally {
  minutes: number;
  dates: Set<string>;
  weekdayMinutes: number;
  weekdayDates: Set<string>;
  weekendMinutes: number;
  weekendDates: Set<string>;
  entries: Set<string>;
}

function tally(): Tally {
  return {
    minutes: 0,
    dates: new Set(),
    weekdayMinutes: 0,
    weekdayDates: new Set(),
    weekendMinutes: 0,
    weekendDates: new Set(),
    entries: new Set(),
  };
}

function add(t: Tally, s: Segment) {
  t.minutes += s.minutes;
  t.dates.add(s.date);
  t.entries.add(s.entry.id);
  if (isWeekend(s.date)) {
    t.weekendMinutes += s.minutes;
    t.weekendDates.add(s.date);
  } else {
    t.weekdayMinutes += s.minutes;
    t.weekdayDates.add(s.date);
  }
}

export interface GroupStats {
  minutes: number;
  entries: number;
  all: Avg;
  /** Mon-Fri */
  weekday: Avg;
  /** Sat-Sun */
  weekend: Avg;
}

function groupStats(t: Tally, days: number, weekdays: number, weekendDays: number): GroupStats {
  return {
    minutes: t.minutes,
    entries: t.entries.size,
    all: avg(t.minutes, days, t.dates.size),
    weekday: avg(t.weekdayMinutes, weekdays, t.weekdayDates.size),
    weekend: avg(t.weekendMinutes, weekendDays, t.weekendDates.size),
  };
}

export interface SubStat extends GroupStats {
  name: string | null;
}

export interface ActivityStat extends GroupStats {
  activity: string;
  subs: SubStat[];
}

export interface JournalStats extends GroupStats {
  /** Calendar days in the counting window. */
  days: number;
  byActivity: ActivityStat[];
  /** Average minutes per Mon..Sun over the window's occurrences of that weekday. */
  weekdayAvg: number[];
  longestStreak: number;
  /** Consecutive logged days ending at the window end (or the day before,
   * so a not-yet-logged today doesn't zero a running streak). */
  currentStreak: number;
  bestDay: { date: string; minutes: number } | null;
  longestEntry: { entry: JournalEntry; minutes: number } | null;
  /** Total per 7 days. */
  perWeek: number;
}

/** `segments` must already be limited to the window (see inRange). */
export function computeStats(segments: Segment[], w: CountingWindow): JournalStats {
  const days = w.days;
  const wdCounts = days ? weekdayCounts(w.from, days) : [0, 0, 0, 0, 0, 0, 0];
  const weekdays = wdCounts.slice(0, 5).reduce((a, b) => a + b, 0);
  const weekendDays = wdCounts[5] + wdCounts[6];

  const total = tally();
  const acts = new Map<string, { t: Tally; subs: Map<string, Tally> }>();
  const perDate = new Map<string, number>();
  const perEntry = new Map<string, { entry: JournalEntry; minutes: number }>();
  const weekdaySum = [0, 0, 0, 0, 0, 0, 0];

  for (const s of segments) {
    add(total, s);
    weekdaySum[weekdayIndex(s.date)] += s.minutes;
    perDate.set(s.date, (perDate.get(s.date) ?? 0) + s.minutes);
    const pe = perEntry.get(s.entry.id) ?? { entry: s.entry, minutes: 0 };
    pe.minutes += s.minutes;
    perEntry.set(s.entry.id, pe);
    let a = acts.get(s.activity);
    if (!a) {
      a = { t: tally(), subs: new Map() };
      acts.set(s.activity, a);
    }
    add(a.t, s);
    const key = s.sub ?? "";
    let sub = a.subs.get(key);
    if (!sub) {
      sub = tally();
      a.subs.set(key, sub);
    }
    add(sub, s);
  }

  let longestStreak = 0;
  let currentStreak = 0;
  if (days > 0) {
    let run = 0;
    for (let d = w.from; d <= w.to; d = addDays(d, 1)) {
      run = perDate.has(d) ? run + 1 : 0;
      longestStreak = Math.max(longestStreak, run);
    }
    let d = perDate.has(w.to) ? w.to : addDays(w.to, -1);
    while (d >= w.from && perDate.has(d)) {
      currentStreak++;
      d = addDays(d, -1);
    }
  }

  let bestDay: JournalStats["bestDay"] = null;
  for (const [date, minutes] of perDate) {
    if (minutes > 0 && (!bestDay || minutes > bestDay.minutes)) bestDay = { date, minutes };
  }
  let longestEntry: JournalStats["longestEntry"] = null;
  for (const pe of perEntry.values()) {
    if (pe.minutes > 0 && (!longestEntry || pe.minutes > longestEntry.minutes)) longestEntry = pe;
  }

  const byActivity: ActivityStat[] = [...acts.entries()]
    .map(([activity, a]) => ({
      activity,
      ...groupStats(a.t, days, weekdays, weekendDays),
      subs: [...a.subs.entries()]
        .map(([name, t]) => ({ name: name || null, ...groupStats(t, days, weekdays, weekendDays) }))
        .sort((x, y) => y.minutes - x.minutes),
    }))
    .sort((x, y) => y.minutes - x.minutes || y.all.loggedDays - x.all.loggedDays);

  return {
    ...groupStats(total, days, weekdays, weekendDays),
    days,
    byActivity,
    weekdayAvg: weekdaySum.map((sum, i) => (wdCounts[i] ? sum / wdCounts[i] : 0)),
    longestStreak,
    currentStreak,
    bestDay,
    longestEntry,
    perWeek: days ? (total.minutes / days) * 7 : 0,
  };
}

/** Relative change, or null when there's nothing to compare against. */
export function change(now: number, before: number | undefined): number | null {
  if (before === undefined || before === 0) return null;
  return (now - before) / before;
}

export type Bucket = "day" | "week" | "month" | "year";

export function bucketFor(rangeDays: number): Bucket {
  if (rangeDays <= 62) return "day";
  if (rangeDays <= 366) return "week";
  if (rangeDays <= 366 * 4) return "month";
  return "year";
}

export function bucketStart(date: string, bucket: Bucket): string {
  if (bucket === "day") return date;
  if (bucket === "week") return startOfWeek(date);
  if (bucket === "year") return date.slice(0, 5) + "01-01";
  return date.slice(0, 8) + "01";
}

function nextBucket(start: string, bucket: Bucket): string {
  if (bucket === "day") return addDays(start, 1);
  if (bucket === "week") return addDays(start, 7);
  if (bucket === "year") return `${Number(start.slice(0, 4)) + 1}-01-01`;
  return monthStart(start, 1);
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
