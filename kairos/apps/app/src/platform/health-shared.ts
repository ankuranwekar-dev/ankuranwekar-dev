import { addDays, diffDays, type CycleData, type ISODate, type MucusType, type PeriodLog } from '@kairos/core';

export interface HealthImport {
  data: CycleData;
  /** Human summary for the confirmation screen, e.g. "8 periods · 23 LH tests · 210 nights of wrist temperature". */
  summary: string;
}

/** Local calendar day of a Date. */
export function dayOf(d: Date): ISODate {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Collapse daily flow samples into periods. A new period starts when a sample
 * is marked as a cycle start, or after a gap of 3+ days without bleeding.
 */
export function periodsFromFlowDays(days: { date: ISODate; cycleStart?: boolean }[]): PeriodLog[] {
  const sorted = [...new Map(days.map((d) => [d.date, d])).values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  const periods: PeriodLog[] = [];
  for (const d of sorted) {
    const last = periods[periods.length - 1];
    if (last && !d.cycleStart && diffDays(last.end ?? last.start, d.date) <= 2) {
      last.end = d.date;
    } else {
      periods.push({ start: d.date, end: d.date });
    }
  }
  return periods;
}

export function summarise(data: CycleData): string {
  const parts = [`${data.periods.length} period${data.periods.length === 1 ? '' : 's'}`];
  if (data.lhTests?.length) parts.push(`${data.lhTests.length} LH tests`);
  const bbt = data.temperatures?.filter((t) => t.source === 'bbt').length ?? 0;
  const wrist = data.temperatures?.filter((t) => t.source === 'wrist').length ?? 0;
  if (bbt) parts.push(`${bbt} temperature readings`);
  if (wrist) parts.push(`${wrist} nights of wrist temperature`);
  if (data.mucus?.length) parts.push(`${data.mucus.length} mucus notes`);
  return parts.join(' · ');
}

export const MUCUS_BY_INDEX: Record<number, MucusType | undefined> = {
  1: 'dry',
  2: 'sticky',
  3: 'creamy',
  4: 'watery',
  5: 'eggwhite',
};

export function yearAgo(): Date {
  return new Date(Date.now() - 400 * 86_400_000);
}

export { addDays };
