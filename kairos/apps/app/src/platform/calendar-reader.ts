import { readCalendarImage, type CalendarReading, type ISODate, type Pixels, type ReadOptions } from '@kairos/core';

import { photoReaderAvailable, startPhoto } from './photo';
import { pixelsOf, type Picked } from './screenshot';

export interface ReadSession {
  reading: CalendarReading;
  /** Which reader produced it: the shape-based one (flat screenshots) or text recognition (photographs). */
  via: 'shape' | 'text';
  /** Where a photograph attempt ended, when one was made and failed. */
  failure?: 'no-text' | 'no-grid' | 'no-flatten';
  /** The photo's edge cut through the calendar, so some days could not be seen. */
  cropped?: boolean;
  /** The same picture read again as if its topmost month were `firstMonth`. */
  reread(firstMonth: ISODate): ReadSession;
}

/** Read pixels that are already flat (a sample, or a screenshot decoded elsewhere). */
export function readPixels(pixels: Pixels, options: ReadOptions): ReadSession {
  const reading = readCalendarImage(pixels, options);
  return { reading, via: 'shape', reread: (m) => readPixels(pixels, { ...options, firstMonth: m }) };
}

const rank = (r: CalendarReading) =>
  (r.status === 'ok' ? 2 : r.status === 'unsure' ? 1 : 0) * 1000 + Math.min(r.days.length, 99) * 5 + r.periods.length;

/**
 * Reads whatever was picked. A photograph of a screen goes through text recognition, which copes with tilt, glare and
 * blur. A flat screenshot goes through the shape reader, which is exact on them. When the picture is not obviously one or the
 * other, both run and the better reading wins; when the first choice comes back doubtful, the other gets a turn too.
 */
export async function readPicked(picked: Picked, options: ReadOptions): Promise<ReadSession> {
  const shape = async (): Promise<ReadSession> => {
    const pixels = await pixelsOf(picked);
    const make = (o: ReadOptions): ReadSession => {
      const reading = readCalendarImage(pixels, o);
      return { reading, via: 'shape', reread: (m) => make({ ...o, firstMonth: m }) };
    };
    return make(options);
  };

  const text = async (): Promise<ReadSession> => {
    const session = await startPhoto(picked.uri, options);
    const make = (reading: ReturnType<typeof session.reread>, o: ReadOptions): ReadSession => ({
      reading,
      via: 'text',
      ...(reading.photo.stage !== 'read' ? { failure: reading.photo.stage } : {}),
      ...(reading.photo.cropped ? { cropped: true } : {}),
      reread: (m) => make(session.reread({ ...o, firstMonth: m }), { ...o, firstMonth: m }),
    });
    return make(session.reading, options);
  };

  const attempt = async (f: () => Promise<ReadSession>): Promise<ReadSession | undefined> => {
    try {
      return await f();
    } catch {
      return undefined;
    }
  };

  const photoFirst = photoReaderAvailable && picked.kind !== 'screenshot';
  const order = photoFirst ? [text, shape] : photoReaderAvailable ? [shape, text] : [shape];
  let best: ReadSession | undefined;
  for (const run of order) {
    const got = await attempt(run);
    if (!got) continue;
    if (!best || rank(got.reading) > rank(best.reading)) best = got;
    // The text route is fast and made for photographs: unless it found no calendar at all, its answer stands (the
    // shape reader would only spend seconds on a photograph). A confident shape reading is final; otherwise the text
    // route gets a turn too.
    if (
      run === text ? got.reading.status !== 'not-found' : best.reading.status === 'ok' && best.reading.confidence >= 0.8
    )
      break;
  }
  if (!best) throw new Error('Could not read that image');
  return best;
}
