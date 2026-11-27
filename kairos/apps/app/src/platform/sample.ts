import type { ISODate, Pixels } from '@kairos/core';

/** Only the web build can draw a sample calendar to try the reader with. */
export const sampleAvailable = false;

export function sampleCalendar(_today: ISODate): Pixels | null {
  return null;
}
