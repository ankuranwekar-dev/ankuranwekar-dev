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

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(128);
for (let i = 0; i < B64.length; i++) LOOKUP[B64.charCodeAt(i)] = i;

export function fromBase64(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i + 1 < clean.length; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)]!;
    const b = LOOKUP[clean.charCodeAt(i + 1)]!;
    const c = i + 2 < clean.length ? LOOKUP[clean.charCodeAt(i + 2)]! : 0;
    const d = i + 3 < clean.length ? LOOKUP[clean.charCodeAt(i + 3)]! : 0;
    out[o++] = (a << 2) | (b >> 4);
    if (i + 2 < clean.length) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < clean.length) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}

/** A picture she or he chose or took, before anything has been read from it. */
export interface Picked {
  uri: string;
  width: number;
  height: number;
  /** A photograph of a screen (camera, or a library image with camera metadata) or a flat screenshot, when known. */
  kind: 'photo' | 'screenshot' | 'unknown';
}

/**
 * A screenshot has no camera metadata and a phone's tall, narrow shape; a photograph has camera metadata or is
 * proportioned like a camera frame. Anything else (a crop, a picture shared through a messenger) could be either.
 */
export function kindOf(exif: Record<string, unknown> | null | undefined, width: number, height: number): Picked['kind'] {
  const camera = ['FNumber', 'ExposureTime', 'ISOSpeedRatings', 'LensModel', 'Make', 'Model', 'FocalLength'];
  if (exif && camera.some((k) => exif[k] !== undefined)) return 'photo';
  const ratio = width / Math.max(1, height);
  return !exif && ratio >= 0.4 && ratio <= 0.52 ? 'screenshot' : 'unknown';
}
