import type { ReadOptions, WeekStart } from '@kairos/core';
import { getCalendars } from 'expo-localization';

/** Hints for the screenshot reader that only the device knows: its first weekday and its weekday letters. */
export function deviceHints(): Pick<ReadOptions, 'weekStart' | 'weekdayInitials'> {
  const out: Pick<ReadOptions, 'weekStart' | 'weekdayInitials'> = {};
  try {
    const first = getCalendars()[0]?.firstWeekday; // 1 = Sunday … 7 = Saturday
    const ws = first === 1 ? 0 : first === 2 ? 1 : first === 7 ? 6 : undefined;
    if (ws !== undefined) out.weekStart = ws as WeekStart;
  } catch {
    /* no hint */
  }
  try {
    const narrow = new Intl.DateTimeFormat(undefined, { weekday: 'narrow', timeZone: 'UTC' });
    // 2023-01-01 was a Sunday.
    out.weekdayInitials = Array.from({ length: 7 }, (_, i) => narrow.format(new Date(Date.UTC(2023, 0, 1 + i))));
  } catch {
    /* English default */
  }
  return out;
}

/** The reader works at this width; anything sharper is wasted effort. */
export const READ_WIDTH = 720;
