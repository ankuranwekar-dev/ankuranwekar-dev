import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { weekday } from '../src/dates';
import { applyH, fitHomography, fitPhotoGrid, monthWord, planRectify, type PhotoOcr } from '../src/import/photo-grid';
import { startCalendarPhoto } from '../src/import/photo';
import { decodePng } from '../src/import/png';

/**
 * Photographs of a phone showing a calendar, simulated from the screenshot fixtures (perspective, rotation, glare,
 * moire, blur, noise, white-balance, JPEG), then run through Apple Vision on a Mac. The words Vision returned are
 * recorded here, so the grid fit and the reading are tested without a device.
 */
const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/photos');

interface Rec {
  id: string;
  fixture: string;
  level: string;
  today: string;
  months: string[];
  periods: { start: string; end?: string }[];
  weekStart: 0 | 1;
  width: number;
  height: number;
  tokens: [string, number, number, number, number, number][];
}

const recs: Rec[] = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
const ocrOf = (r: Rec): PhotoOcr => ({
  width: r.width,
  height: r.height,
  tokens: r.tokens.map(([text, x, y, w, h, confidence]) => ({ text, x, y, w, h, confidence })),
});

/** Column of the 1st of a month, counting from the week start. */
const firstCol = (month: string, ws: number) => (weekday(month) - ws + 7) % 7;

describe('homography', () => {
  it('recovers a known projective transform from noisy points', () => {
    const H = [90, 12, 300, -8, 85, 200, 0.0002, 0.0004, 1] as const;
    const pts = [];
    for (let c = 0; c < 7; c++) {
      for (let r = 0; r < 5; r++) {
        const [u, v] = applyH(H, c, r);
        pts.push({ a: c, b: r, u: u + Math.sin(c * 7 + r) * 0.4, v: v + Math.cos(c + r * 3) * 0.4 });
      }
    }
    const fit = fitHomography(pts)!;
    for (const [c, r] of [[0, 0], [6, 4], [3, 2]] as const) {
      const [x0, y0] = applyH(H, c, r);
      const [x1, y1] = applyH(fit, c, r);
      expect(Math.hypot(x1 - x0, y1 - y0)).toBeLessThan(1);
    }
  });
});

describe('month words', () => {
  it('reads full and abbreviated English month names', () => {
    expect(monthWord('August')).toBe(8);
    expect(monthWord('Sept.')).toBe(9);
    expect(monthWord('dec')).toBe(12);
    expect(monthWord('Today')).toBe(0);
    expect(monthWord('Mar:')).toBe(3);
    expect(monthWord('Marketing')).toBe(0);
  });
});

describe('fitting the calendar grid to recognised text', () => {
  for (const r of recs) {
    it(`${r.id}: finds the lattice, with each month's 1st in the right column`, () => {
      const fit = fitPhotoGrid(ocrOf(r));
      expect(fit, 'a grid').not.toBeNull();
      expect(fit!.inliers).toBeGreaterThanOrEqual(14);
      expect(fit!.rms).toBeLessThan(0.1 * fit!.pitch);
      const expected = new Set(r.months.map((m) => firstCol(m, r.weekStart)));
      // A month whose weekday matches is the only way a block's 1st can land in a column no month has.
      for (const b of fit!.blocks) expect(expected.has(b.first), `column ${b.first} of ${[...expected]}`).toBe(true);
    });
  }

  it('plans a flat window that is as wide as the columns and sits inside the photo', () => {
    for (const r of recs) {
      const ocr = ocrOf(r);
      const fit = fitPhotoGrid(ocr)!;
      const plan = planRectify(fit, ocr);
      expect(plan.width).toBe(720);
      expect(plan.height).toBeGreaterThan(300);
      // The window's top and bottom are trimmed to the photo; its sides are the columns, and say so when cut off.
      for (const [x, y] of [[0, 0], [plan.width, 0], [0, plan.height], [plan.width, plan.height]] as const) {
        const [u, v] = applyH(plan.homography, x, y);
        // The first numeral row may itself sit at the photo's edge, so the window can overhang a little.
        expect(v).toBeGreaterThanOrEqual(-0.7 * fit.pitch);
        expect(v).toBeLessThanOrEqual(r.height + 0.7 * fit.pitch);
        if (!plan.cropped) {
          expect(u).toBeGreaterThanOrEqual(-0.3 * fit.pitch);
          expect(u).toBeLessThanOrEqual(r.width + 0.3 * fit.pitch);
        }
      }
    }
  });

  it('gives up cleanly when the words are not a calendar', () => {
    const words = 'Meeting notes for Monday the agenda is long and boring Chapter Page Section Table Figure Index'.split(' ');
    const ocr: PhotoOcr = {
      width: 2000,
      height: 3000,
      tokens: words.map((text, i) => ({ text, x: 200 + (i % 5) * 300, y: 300 + Math.floor(i / 5) * 90, w: 160, h: 40, confidence: 0.9 })),
    };
    expect(fitPhotoGrid(ocr)).toBeNull();
  });

  it('does not take a column of unrelated numbers for a month', () => {
    const tokens = Array.from({ length: 14 }, (_, i) => ({ text: String(10 + i * 7), x: 400, y: 300 + i * 120, w: 60, h: 40, confidence: 0.9 }));
    expect(fitPhotoGrid({ width: 1200, height: 2400, tokens })).toBeNull();
  });
});

describe('reading a straightened photograph', () => {
  const flat = (id: string) => decodePng(new Uint8Array(readFileSync(join(dir, 'flat', `${id}.png`))));

  for (const id of ['coral-00-easy-0', 'health-dark-01-typical-0', 'noir-01-hard-0']) {
    it(`${id}: reads the same periods the screenshot has`, async () => {
      const r = recs.find((x) => x.id === id)!;
      const pixels = flat(id);
      let planned: { width: number; height: number } | undefined;
      const session = await startCalendarPhoto(
        ocrOf(r),
        async (plan) => {
          planned = plan;
          return pixels;
        },
        { today: r.today },
      );
      // The stored image was cut from the plan this code makes now.
      expect(Math.abs(planned!.width - pixels.width)).toBeLessThanOrEqual(2);
      expect(Math.abs(planned!.height - pixels.height)).toBeLessThanOrEqual(6);
      expect(session.reading.photo.stage).toBe('read');
      expect(session.reading.status).not.toBe('not-found');
      expect(session.reading.periods).toEqual(r.periods);
      expect(session.reading.weekStart).toBe(r.weekStart);
      for (const m of session.reading.months) expect(r.months).toContain(m);
    });
  }

  it('reports each way it can fail', async () => {
    const r = recs[0]!;
    const few = await startCalendarPhoto({ width: 100, height: 100, tokens: [] }, async () => null, { today: r.today });
    expect(few.reading.photo.stage).toBe('no-text');
    expect(few.reading.status).toBe('not-found');

    const none = await startCalendarPhoto(
      { width: 2000, height: 3000, tokens: Array.from({ length: 20 }, (_, i) => ({ text: 'word', x: 100 + i * 50, y: 100, w: 40, h: 20, confidence: 0.9 })) },
      async () => null,
      { today: r.today },
    );
    expect(none.reading.photo.stage).toBe('no-grid');

    const unflattenable = await startCalendarPhoto(ocrOf(r), async () => null, { today: r.today });
    expect(unflattenable.reading.photo.stage).toBe('no-flatten');
  });

  it('can be read again as a different month when she corrects the guess', async () => {
    const r = recs.find((x) => x.id === 'coral-00-easy-0')!;
    const session = await startCalendarPhoto(ocrOf(r), async () => flat(r.id), { today: r.today });
    const wrong = session.reread({ today: r.today, firstMonth: '2027-02-01' });
    expect(wrong.months[0]).not.toBe(session.reading.months[0]);
  });
});
