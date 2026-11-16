import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { addDays, decodePng, mulberry32, readCalendarImage, type ISODate, type PeriodLog, type Pixels } from '../src';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/calendars');

interface Fixture {
  file: string;
  today: ISODate;
  months: ISODate[];
  periods: PeriodLog[];
  weekStart: 0 | 1;
  exact: boolean;
}
const fixtures: Fixture[] = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
const load = (file: string): Pixels => decodePng(new Uint8Array(readFileSync(join(dir, file))));

describe('PNG decoder', () => {
  it('decodes a screenshot to RGBA', () => {
    const px = load(fixtures[0]!.file);
    expect(px.width).toBe(720);
    expect(px.data.length).toBe(px.width * px.height * 4);
    // Screenshots are opaque.
    expect(px.data[3]).toBe(255);
  });

  it('rejects anything that is not a PNG', () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toThrow(/Not a PNG/);
  });
});

describe('calendar screenshot reader', () => {
  // Look-alike calendars in the styles of popular trackers; see bench/calendars.
  for (const f of fixtures.filter((x) => x.exact)) {
    it(`reads ${f.file}`, () => {
      const reading = readCalendarImage(load(f.file), { today: f.today });
      expect(reading.status).not.toBe('not-found');
      expect(reading.months).toEqual(f.months);
      expect(reading.weekStart).toBe(f.weekStart);
      expect(reading.periods).toEqual(f.periods);
      // Every day it claims to have read is a real, distinct date in those months.
      const dates = reading.days.map((d) => d.date);
      expect(new Set(dates).size).toBe(dates.length);
      expect(dates.every((d) => d >= f.months[0]! && d < addDays(f.months[f.months.length - 1]!, 31))).toBe(true);
    });
  }

  it('reads a full fixture set', () => {
    expect(fixtures.filter((x) => x.exact).length).toBeGreaterThanOrEqual(8);
  });

  it('never reports a period that starts after today as logged', () => {
    for (const f of fixtures) {
      const reading = readCalendarImage(load(f.file), { today: f.today });
      for (const p of reading.periods) expect(p.start <= f.today).toBe(true);
      for (const p of reading.predicted) expect(p > f.today).toBe(true);
    }
  });

  it('can be told which month it is looking at', () => {
    const f = fixtures.find((x) => x.exact && x.periods.length > 0)!;
    const px = load(f.file);
    const free = readCalendarImage(px, { today: f.today });
    // Seven years on, the calendar repeats only if the weekdays line up; force a month that does not fit.
    const forced = readCalendarImage(px, { today: f.today, firstMonth: addDays(free.months[0]!, 32) });
    expect(forced.months[0]).toBe(addDays(free.months[0]!, 32).slice(0, 8) + '01');
    expect(forced.status).not.toBe('ok');
  });

  it('finds nothing in a blank image', () => {
    const data = new Uint8Array(400 * 800 * 4).fill(255);
    expect(readCalendarImage({ width: 400, height: 800, data }, { today: '2026-11-16' }).status).toBe('not-found');
  });

  it('finds nothing in a photo-like image', () => {
    const rnd = mulberry32(7);
    const w = 480;
    const h = 900;
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const v = 128 + 80 * Math.sin(x / 37) * Math.cos(y / 53) + 30 * (rnd() - 0.5);
        data[i] = v;
        data[i + 1] = v * 0.9;
        data[i + 2] = v * 0.7;
        data[i + 3] = 255;
      }
    }
    const reading = readCalendarImage({ width: w, height: h, data }, { today: '2026-11-16' });
    expect(reading.status).toBe('not-found');
    expect(reading.periods).toEqual([]);
  });

  it('refuses tiny images', () => {
    const data = new Uint8Array(50 * 50 * 4);
    expect(readCalendarImage({ width: 50, height: 50, data }, { today: '2026-11-16' }).status).toBe('not-found');
  });
});
