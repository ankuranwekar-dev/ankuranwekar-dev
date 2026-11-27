/**
 * Calendar-day arithmetic.
 *
 * Cycles are counted in whole local calendar days, never in hours, so every
 * date in the engine is an ISO `YYYY-MM-DD` string and all arithmetic happens
 * on integer "epoch days" in UTC. This sidesteps DST and timezone drift: a
 * period that started on 2026-03-29 started on that calendar day wherever the
 * phone happens to be.
 */

export type ISODate = string; // YYYY-MM-DD

const MS_PER_DAY = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** ISO date → integer days since 1970-01-01. Throws on malformed input. */
export function toDayNumber(iso: ISODate): number {
  const m = ISO_RE.exec(iso);
  if (!m) throw new RangeError(`Invalid ISO date: ${iso}`);
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const day = ms / MS_PER_DAY;
  // Reject impossible dates such as 2026-02-31, which Date.UTC silently rolls over.
  if (fromDayNumber(day) !== iso) throw new RangeError(`Invalid ISO date: ${iso}`);
  return day;
}

/** Integer days since 1970-01-01 → ISO date. */
export function fromDayNumber(day: number): ISODate {
  const d = new Date(day * MS_PER_DAY);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

export function addDays(iso: ISODate, days: number): ISODate {
  return fromDayNumber(toDayNumber(iso) + days);
}

/** Whole days from `a` to `b` (b − a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return toDayNumber(b) - toDayNumber(a);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(iso: ISODate): number {
  return (((toDayNumber(iso) + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

export function isWeekend(iso: ISODate): boolean {
  const w = weekday(iso);
  return w === 0 || w === 6;
}

/** Today's date in the device's local timezone. */
export function localToday(now: Date = new Date()): ISODate {
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const da = String(now.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Inclusive range of ISO dates. */
export function dateRange(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const s = toDayNumber(start);
  const e = toDayNumber(end);
  for (let d = s; d <= e; d++) out.push(fromDayNumber(d));
  return out;
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function weekdayName(iso: ISODate): string {
  return WEEKDAY_NAMES[weekday(iso)]!;
}

/** "today", "tomorrow", "Thursday", or "in 9 days" relative to `from`. */
export function relativeDayLabel(target: ISODate, from: ISODate): string {
  const d = diffDays(from, target);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  if (d > 1 && d < 7) return weekdayName(target);
  if (d >= 7) return `in ${d} days`;
  return `${-d} days ago`;
}
