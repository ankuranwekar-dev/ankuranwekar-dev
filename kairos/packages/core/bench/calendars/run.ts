/**
 * Screenshot-reader benchmark.
 *
 *   pnpm --filter @kairos/core bench:calendars            # full run
 *   pnpm --filter @kairos/core bench:calendars -- --fixtures   # also refresh test fixtures
 *
 * Renders look-alike tracker calendars in Chromium at real phone sizes,
 * screenshots them, runs the reader, and scores it against what was drawn.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright-core';

import {
  addDays,
  decodePng,
  diffDays,
  mulberry32,
  hashString,
  readCalendarImage,
  type CalendarReading,
  type ISODate,
  type PeriodLog,
  type Pixels,
} from '../../src';
import { render, STYLES, type Style, type Truth } from './styles';

const here = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const ONLY = [...args].find((a) => a.startsWith('--only='))?.slice(7);
const PER_STYLE = Number([...args].find((a) => a.startsWith('--n='))?.slice(4) ?? 24);
const OUT = join(here, 'out');

const DEVICES = [
  { w: 390, h: 844, dpr: 3 },
  { w: 393, h: 852, dpr: 3 },
  { w: 430, h: 932, dpr: 3 },
  { w: 375, h: 667, dpr: 2 },
  { w: 412, h: 915, dpr: 2.625 },
  { w: 360, h: 780, dpr: 3 },
];

interface Scenario {
  id: string;
  style: Style;
  truth: Truth;
  months: { y: number; m: number }[];
  scroll: number;
  device: (typeof DEVICES)[number];
  variant: 'png' | 'jpeg' | 'small';
}

function scenario(style: Style, i: number): Scenario {
  const rnd = mulberry32(hashString(`${style.name}:${i}`));
  const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

  // Any day across four years, so every month shape and weekday alignment turns up.
  const today = addDays('2024-01-01', int(0, 365 * 4));
  const cycle = int(24, 35);
  const bleed = int(3, 7);
  const periods: Required<PeriodLog>[] = [];
  const predicted: Required<PeriodLog>[] = [];
  const fertile: Truth['fertile'] = [];
  let start = addDays(today, -int(0, cycle - 1) - cycle * 5);
  for (let c = 0; c < 9; c++) {
    const length = cycle + int(-2, 2);
    const end = addDays(start, bleed - 1);
    if (start <= today) {
      periods.push({ start, end: end > today ? today : end });
      if (end > today) predicted.push({ start: addDays(today, 1), end });
    } else predicted.push({ start, end });
    const ovulation = addDays(start, length - 14);
    fertile.push({ start: addDays(ovulation, -5), end: addDays(ovulation, 1), peak: ovulation });
    start = addDays(start, length);
  }

  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const shift = (k: number) => {
    const t = y * 12 + (m - 1) + k;
    return { y: Math.floor(t / 12), m: (t % 12) + 1 };
  };
  const back = rnd() < 0.3 ? 1 : 0; // sometimes she screenshots last month
  const months =
    style.layout === 'page' ? [shift(-back)] : [shift(-2 - back), shift(-1 - back), shift(-back), shift(1 - back)];
  const scroll = style.layout === 'page' ? 0 : int(0, 3 * 5 * style.rowHeight);
  return {
    id: `${style.name}-${String(i).padStart(2, '0')}`,
    style,
    truth: { today, periods, predicted, fertile },
    months,
    scroll,
    device: pick(DEVICES),
    variant: pick(['png', 'png', 'jpeg', 'small']),
  };
}

/**
 * Dates whose numeral is fully visible between the sticky header and the tab bar, and those that
 * are only partly visible (the reader may or may not make those out; either is fine).
 */
async function visibleDates(page: Page): Promise<{ full: ISODate[]; partial: ISODate[] }> {
  return page.evaluate(() => {
    const top = document.querySelector('header')!.getBoundingClientRect().bottom;
    const nav = document.querySelector('nav');
    const bottom = nav ? nav.getBoundingClientRect().top : window.innerHeight;
    const full: string[] = [];
    const partial: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('.day[data-date]')) {
      if (!el.dataset.date) continue;
      const cell = el.getBoundingClientRect();
      const r = el.querySelector('b')!.getBoundingClientRect();
      if (cell.top >= top && cell.bottom <= bottom) full.push(el.dataset.date);
      else if (r.bottom > top && r.top < bottom) partial.push(el.dataset.date);
    }
    return { full, partial };
  });
}

/** Re-encode through Chromium to mimic a screenshot forwarded over a messenger. */
async function degrade(page: Page, png: Buffer, variant: 'jpeg' | 'small'): Promise<Pixels> {
  const result = await page.evaluate(
    async ({ b64, variant }) => {
      const load = (src: string) =>
        new Promise<HTMLImageElement>((res) => {
          const im = new Image();
          im.onload = () => res(im);
          im.src = src;
        });
      const im = await load(`data:image/png;base64,${b64}`);
      const scale = variant === 'small' ? Math.min(1, 1600 / Math.max(im.width, im.height)) : 1;
      const c = document.createElement('canvas');
      c.width = Math.round(im.width * scale);
      c.height = Math.round(im.height * scale);
      const g = c.getContext('2d')!;
      g.imageSmoothingQuality = 'high';
      g.drawImage(im, 0, 0, c.width, c.height);
      const jpeg = await load(c.toDataURL('image/jpeg', variant === 'small' ? 0.72 : 0.6));
      g.drawImage(jpeg, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height);
      let s = '';
      for (let i = 0; i < d.data.length; i += 0x8000) s += String.fromCharCode(...d.data.subarray(i, i + 0x8000));
      return { w: c.width, h: c.height, data: btoa(s) };
    },
    { b64: png.toString('base64'), variant },
  );
  return { width: result.w, height: result.h, data: new Uint8Array(Buffer.from(result.data, 'base64')) };
}

function expected(s: Scenario, visible: Set<ISODate>): PeriodLog[] {
  const first = [...visible].sort()[0]!;
  const out: PeriodLog[] = [];
  for (const p of s.truth.periods) {
    if (!visible.has(p.start) || p.start === first) continue;
    const closed = p.end < s.truth.today && visible.has(addDays(p.end, 1));
    out.push(closed ? { start: p.start, end: p.end } : { start: p.start });
  }
  return out;
}

const same = (a: PeriodLog[], b: PeriodLog[]) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const rows: Record<
    string,
    { n: number; ok: number; unsure: number; missed: number; dates: number; exact: number; wrongOk: number }
  > = {};
  const failures: string[] = [];
  const reasons = new Map<string, number>();
  const fixtures: unknown[] = [];
  let ms = 0;

  for (const style of STYLES) {
    const row = (rows[style.name] = { n: 0, ok: 0, unsure: 0, missed: 0, dates: 0, exact: 0, wrongOk: 0 });
    for (let i = 0; i < PER_STYLE; i++) {
      const s = scenario(style, i);
      if (ONLY && s.id !== ONLY) continue;
      const context = await browser.newContext({
        viewport: { width: s.device.w, height: s.device.h },
        deviceScaleFactor: s.device.dpr,
      });
      const page = await context.newPage();
      await page.setContent(render(s.style, s.truth, s.months, s.scroll));
      // tsx wraps named inner functions with a helper that does not exist in the page.
      await page.evaluate('window.__name = (f) => f');
      await page.evaluate(() => document.fonts.ready);
      const shown = await visibleDates(page);
      const visible = new Set(shown.full);
      const allowed = new Set([...shown.full, ...shown.partial]);
      const png = await page.screenshot({ type: 'png' });
      const pixels = s.variant === 'png' ? decodePng(new Uint8Array(png)) : await degrade(page, png, s.variant);
      await context.close();
      if (visible.size < 14) continue;

      const t0 = performance.now();
      let reading: CalendarReading;
      try {
        reading = readCalendarImage(pixels, {
          today: s.truth.today,
          ...(ONLY ? { trace: (g) => console.log(JSON.stringify(g, null, 1)) } : {}),
        });
      } catch (e) {
        reading = { status: 'not-found', months: [], days: [], periods: [], predicted: [], confidence: 0 };
        failures.push(`${s.id}: threw ${(e as Error).message}`);
      }
      ms += performance.now() - t0;

      // Judge the periods against what was drawn on the dates the reader says it read.
      const read = new Set(reading.days.map((d) => d.date));
      const want = expected(s, read.size ? read : visible);
      const datesRight =
        reading.days.length > 0 &&
        [...read].every((d) => allowed.has(d)) &&
        [...visible].filter((d) => read.has(d)).length >= 0.9 * visible.size;
      const exact = datesRight && same(reading.periods, want);

      const why = `${style.name.padEnd(12)} ${reading.status}${reading.reason ? '/' + reading.reason : ''} ws:${reading.weekStartFrom} conf<.5:${reading.confidence < 0.5}`;
      reasons.set(why, (reasons.get(why) ?? 0) + 1);
      row.n++;
      if (reading.status === 'ok') row.ok++;
      else if (reading.status === 'unsure') row.unsure++;
      else row.missed++;
      if (datesRight) row.dates++;
      if (exact) row.exact++;
      if (reading.status === 'ok' && !exact) row.wrongOk++;
      if (ONLY) {
        // Save exactly what the reader saw (after any re-encoding), for debug.ts.
        const { PNG } = createRequire(import.meta.url)('pngjs');
        const seenPng = new PNG({ width: pixels.width, height: pixels.height });
        seenPng.data.set(pixels.data);
        writeFileSync(join(OUT, `${s.id}.png`), PNG.sync.write(seenPng));
      }
      if (!exact) {
        const extra = [...read].filter((d) => !allowed.has(d));
        const lost = [...visible].filter((d) => !read.has(d));
        failures.push(
          `${s.id} [${s.variant} ${s.device.w}@${s.device.dpr}] today ${s.truth.today} status=${reading.status}${reading.reason ? `/${reading.reason}` : ''} conf=${reading.confidence.toFixed(2)} months=${reading.months.join('|')} dates=${datesRight} extra=${extra.slice(0, 6).join(',')}(${extra.length}) lost=${lost.slice(0, 6).join(',')}(${lost.length}) ws=${reading.weekStart}\n    want ${JSON.stringify(want)}\n    got  ${JSON.stringify(reading.periods)}`,
        );
        if (!ONLY) writeFileSync(join(OUT, `${s.id}.png`), png);
      }
      if (args.has('--fixtures') && i < 2 && s.variant === 'png') {
        const name = `${s.id}.png`;
        const small = await shrink(browser, png);
        mkdirSync(join(here, '../../test/fixtures/calendars'), { recursive: true });
        writeFileSync(join(here, '../../test/fixtures/calendars', name), small);
        // The stored copy is resampled, so score the fixture on what is read from that copy.
        const again = readCalendarImage(decodePng(new Uint8Array(small)), { today: s.truth.today });
        const readAgain = new Set(again.days.map((d) => d.date));
        const wantAgain = expected(s, readAgain);
        fixtures.push({
          file: name,
          today: s.truth.today,
          months: again.months,
          periods: wantAgain,
          weekStart: style.weekStart,
          exact: [...readAgain].every((d) => allowed.has(d)) && same(again.periods, wantAgain),
        });
      }
    }
  }
  await browser.close();

  const pct = (a: number, b: number) => `${b ? Math.round((100 * a) / b) : 0}%`.padStart(5);
  let total = { n: 0, ok: 0, unsure: 0, missed: 0, dates: 0, exact: 0, wrongOk: 0 };
  console.log('style         n    ok  unsure  missed  dates-right  periods-exact  confident-but-wrong');
  for (const [name, r] of Object.entries(rows)) {
    console.log(
      `${name.padEnd(12)} ${String(r.n).padStart(3)} ${pct(r.ok, r.n)}  ${pct(r.unsure, r.n)}   ${pct(r.missed, r.n)}        ${pct(r.dates, r.n)}          ${pct(r.exact, r.n)}                ${pct(r.wrongOk, r.n)}`,
    );
    for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += r[k];
  }
  const r = total;
  console.log(
    `${'all'.padEnd(12)} ${String(r.n).padStart(3)} ${pct(r.ok, r.n)}  ${pct(r.unsure, r.n)}   ${pct(r.missed, r.n)}        ${pct(r.dates, r.n)}          ${pct(r.exact, r.n)}                ${pct(r.wrongOk, r.n)}`,
  );
  console.log(`\n${(ms / r.n).toFixed(0)} ms per screenshot (Node)`);
  if (args.has('--why')) for (const [k, v] of [...reasons].sort()) console.log(String(v).padStart(4), k);
  if (failures.length) console.log(`\n${failures.length} not exact:\n` + failures.slice(0, 40).join('\n'));
  if (args.has('--fixtures')) {
    writeFileSync(join(here, '../../test/fixtures/calendars/index.json'), JSON.stringify(fixtures, null, 2) + '\n');
    console.log(`\nwrote ${fixtures.length} fixtures`);
  }
}

/** Fixtures are stored at the reader's working width to keep the repository small. */
async function shrink(browser: Awaited<ReturnType<typeof chromium.launch>>, png: Buffer): Promise<Buffer> {
  const page = await browser.newPage();
  await page.evaluate('window.__name = (f) => f');
  const b64 = await page.evaluate(
    async (src) => {
      const im = new Image();
      await new Promise((res) => {
        im.onload = res;
        im.src = src;
      });
      const c = document.createElement('canvas');
      c.width = 720;
      c.height = Math.round((im.height * 720) / im.width);
      const g = c.getContext('2d')!;
      g.imageSmoothingQuality = 'high';
      g.drawImage(im, 0, 0, c.width, c.height);
      return c.toDataURL('image/png').split(',')[1]!;
    },
    `data:image/png;base64,${png.toString('base64')}`,
  );
  await page.close();
  return Buffer.from(b64, 'base64');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
