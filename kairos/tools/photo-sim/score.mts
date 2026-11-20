// Score a calendar reader against simulated camera photos.
//   npx tsx score.ts baseline        -> the reader as the app calls it today (photo shrunk to 720 wide)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CORE = resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/core');
// Where sim.py wrote its photos (out/), where vision-cli was built, and where tokens.jsonl goes: see README.md.
const HERE = process.env.PHOTO_SIM_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), '.work');

const { readCalendarImage } = await import(`${CORE}/src/index.ts`);
const { decodePng } = await import(`${CORE}/src/import/png.ts`);

interface Entry { id: string; fixture: string; level: string; today: string; months: string[]; periods: any[]; weekStart: number }
const manifest: Entry[] = JSON.parse(readFileSync(join(HERE, 'out/manifest.json'), 'utf8'));
const fixtures: Entry[] = JSON.parse(readFileSync(join(CORE, 'test/fixtures/calendars/index.json'), 'utf8'));

// Ground truth per fixture: what the reader sees on the clean screenshot, which the tests prove is exact.
const truth = new Map<string, Map<string, string>>();
for (const f of fixtures) {
  const r = readCalendarImage(decodePng(new Uint8Array(readFileSync(join(CORE, 'test/fixtures/calendars', f.fixture ?? (f as any).file)))), { today: f.today });
  truth.set((f as any).file, new Map(r.days.map((d: any) => [d.date, d.mark])));
}

export interface Outcome { id: string; level: string; status: string; read: number; datesRight: boolean; periodsRight: boolean; covered: boolean; predictedRight: boolean; note: string }

const endOf = (m: string) => { const d = new Date(m + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };

export function judge(e: Entry, reading: any): Outcome {
  const t = truth.get(e.fixture)!;
  const lo0 = e.months[0]!, hi0 = endOf(e.months[e.months.length - 1]!);
  const read: [string, string][] = reading.days.map((d: any) => [d.date, d.mark]);
  const datesRight = read.length >= 14 && read.every(([d]) => d >= lo0 && d <= hi0);
  let periodsRight = datesRight, predictedRight = datesRight;
  let note = '';
  if (datesRight) {
    for (const [d, m] of read) {
      const want = t.get(d);
      if (want === undefined) continue; // a day the clean read did not see: no ground truth
      if ((m === 'period') !== (want === 'period') && periodsRight) { periodsRight = false; note = `${d} read ${m} want ${want}`; }
      if ((m === 'predicted') !== (want === 'predicted') && predictedRight) predictedRight = false;
    }
  } else note = read.length < 14 ? `only ${read.length} days${reading.reason ? ' (' + reading.reason + ')' : ''}` : `date ${read.find(([d]) => d < lo0 || d > hi0)?.[0]} outside ${lo0}..${hi0}`;
  const marked = [...t].filter(([, m]) => m === 'period');
  const got = new Set(read.filter(([, m]) => m === 'period').map(([d]) => d));
  const rd = read.map(([d]) => d).sort();
  const lo = rd[0], hi = rd.at(-1);
  const inRange = marked.filter(([d]) => lo && hi && d >= lo && d <= hi);
  const covered = datesRight && inRange.every(([d]) => got.has(d));
  if (datesRight && periodsRight && !covered) note = 'a period day was missed';
  return { id: e.id, level: e.level, status: reading.status, read: read.length, datesRight, periodsRight, covered, predictedRight, note };
}

export function report(name: string, outs: Outcome[]) {
  const levels = ['easy', 'typical', 'hard'];
  console.log(`\n${name}\nlevel      n   ok  unsure  nf   dates  marks  covered  EXACT  pred  confident-but-wrong`);
  for (const l of [...levels, 'all']) {
    const o = outs.filter((x) => l === 'all' || x.level === l);
    const c = (f: (x: Outcome) => boolean) => String(o.filter(f).length).padStart(3);
    const exact = (x: Outcome) => x.datesRight && x.periodsRight && x.covered;
    console.log(`${l.padEnd(9)} ${String(o.length).padStart(3)} ${c((x) => x.status === 'ok')}  ${c((x) => x.status === 'unsure')}    ${c((x) => x.status === 'not-found')}  ${c((x) => x.datesRight)}    ${c((x) => x.datesRight && x.periodsRight)}    ${c((x) => x.covered)}     ${c(exact)}  ${c((x) => x.predictedRight)}    ${c((x) => x.status === 'ok' && !exact(x))}`);
  }
}

if (process.argv[2] === 'baseline') {
  const outs: Outcome[] = [];
  for (const e of manifest) {
    const px = decodePng(new Uint8Array(readFileSync(join(HERE, 'out/small', `${e.id}.png`))));
    let r;
    try { r = readCalendarImage(px, { today: e.today }); } catch (err) { r = { status: 'not-found', days: [] }; }
    outs.push(judge(e, r));
  }
  report('BASELINE: current reader on the 720-wide photo', outs);
  for (const o of outs.filter((x) => !(x.datesRight && x.periodsRight && x.covered)).slice(0, 12)) console.log(' ', o.id, o.status, o.note);
}

const { fitPhotoGrid, planRectify } = await import(`${CORE}/src/import/photo-grid.ts`);
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

if (process.argv[2] === 'plan') {
  // tokens.jsonl (vision-cli) -> fit -> plans.json for the rectifier
  const toks = new Map<string, any>();
  for (const line of readFileSync(join(HERE, 'tokens.jsonl'), 'utf8').trim().split('\n')) {
    const o = JSON.parse(line);
    toks.set(o.file, o);
  }
  mkdirSync(join(HERE, 'out/rect'), { recursive: true });
  const plans: any[] = [];
  let nofit = 0;
  const fits: any = {};
  for (const e of manifest) {
    const o = toks.get(`${e.id}.jpg`);
    const ocr = { width: o.width, height: o.height, tokens: o.tokens.map((t: any) => ({ text: t.t, x: t.x, y: t.y, w: t.w, h: t.h, confidence: t.c })) };
    const fit = fitPhotoGrid(ocr);
    if (!fit) { nofit++; fits[e.id] = null; continue; }
    const plan = planRectify(fit, ocr);
    fits[e.id] = { inliers: fit.inliers, rms: +fit.rms.toFixed(2), pitch: +fit.pitch.toFixed(1), blocks: fit.blocks.map((b: any) => ({ first: b.first, shift: +b.shift.toFixed(2), n: b.days.length })), aspect: +plan.aspect.toFixed(3), out: [plan.width, plan.height] };
    plans.push({ image: join(HERE, 'out/photos', `${e.id}.jpg`), out: join(HERE, 'out/rect', `${e.id}.png`), h: plan.homography, w: plan.width, hh: plan.height });
  }
  writeFileSync(join(HERE, 'plans.json'), JSON.stringify(plans));
  writeFileSync(join(HERE, 'fits.json'), JSON.stringify(fits, null, 1));
  console.log(`planned ${plans.length}, no fit ${nofit}`);
}

if (process.argv[2] === 'rect') {
  const outs: Outcome[] = [];
  const fitsAll = JSON.parse(readFileSync(join(HERE, 'fits.json'), 'utf8'));
  for (const e of manifest) {
    const f = join(HERE, 'out/rect', `${e.id}.png`);
    let r: any = { status: 'not-found', days: [] };
    if (fitsAll[e.id] && existsSync(f)) {
      try { r = readCalendarImage(decodePng(new Uint8Array(readFileSync(f))), { today: e.today }); } catch (err) { r = { status: 'not-found', days: [] }; }
    }
    const o = judge(e, r);
    if (!fitsAll[e.id]) o.note = 'no grid fit';
    outs.push(o);
  }
  report('PIPELINE: Vision -> homography -> flatten -> reader', outs);
  for (const o of outs.filter((x) => !(x.datesRight && x.periodsRight && x.covered))) console.log(' ', o.id.padEnd(24), o.status.padEnd(9), o.note);
}

if (process.argv[2] === 'photo') {
  const { readCalendarPhoto } = await import(`${CORE}/src/import/photo.ts`);
  const { execFileSync } = await import('node:child_process');
  const toks = new Map<string, any>();
  for (const line of readFileSync(join(HERE, process.env.TOKENS ?? 'tokens.jsonl'), 'utf8').trim().split('\n')) { const o = JSON.parse(line); toks.set(o.file, o); }
  mkdirSync(join(HERE, 'out/rect'), { recursive: true });
  const PHOTOS = process.env.PHOTO_DIR ?? 'out/photos';
  const outs: Outcome[] = [];
  const only = process.argv[3];
  const detail: any[] = [];
  for (const e of manifest) {
    if (only && !e.id.includes(only)) continue;
    const o = toks.get(`${e.id}.jpg`);
    if (!o) continue;
    const ocr = { width: o.width, height: o.height, tokens: o.tokens.map((t: any) => ({ text: t.t, x: t.x, y: t.y, w: t.w, h: t.h, confidence: t.c })) };
    const flatten = async (plan: any) => {
      const out = join(HERE, 'out/rect', `${e.id}.png`);
      const pf = join(HERE, 'out/rect', `${e.id}.plan.json`);
      writeFileSync(pf, JSON.stringify([{ image: join(HERE, PHOTOS, `${e.id}.jpg`), out, turns: o.turns ?? 0, h: plan.homography, w: plan.width, hh: plan.height }]));
      execFileSync(join(HERE, 'vision-cli'), ['rectify', '3000', pf]);
      return decodePng(new Uint8Array(readFileSync(out)));
    };
    let r: any;
    try { r = await readCalendarPhoto(ocr, flatten, { today: e.today }); } catch (err) { r = { status: 'not-found', days: [], photo: { stage: 'threw ' + (err as Error).message } }; }
    const j = judge(e, r);
    if (r.photo?.stage !== 'read') j.note = `stage ${r.photo?.stage} ` + j.note;
    outs.push(j);
    detail.push({ id: e.id, status: r.status, reason: r.reason, months: r.months, conf: +(r.confidence ?? 0).toFixed(2), alts: r.alternatives, periods: r.periods, ws: r.weekStart, wsFrom: r.weekStartFrom, want: e.periods, wantMonths: e.months });
  }
  report('PHOTO PIPELINE (OCR grid): Vision -> homography -> flatten -> OCR-scene reader', outs);
  for (const o of outs.filter((x) => !(x.datesRight && x.periodsRight && x.covered))) console.log(' ', o.id.padEnd(24), o.status.padEnd(9), o.note);
  console.log('\nconfident but wrong (status ok):');
  for (const o of outs.filter((x) => x.status === 'ok' && !(x.datesRight && x.periodsRight && x.covered))) console.log(' ', o.id, o.note, JSON.stringify(detail.find((d) => d.id === o.id)));
  writeFileSync(join(HERE, 'photo-detail.json'), JSON.stringify(detail, null, 1));
}

if (process.argv[2] === 'clean') {
  // The repo's flat screenshots through the OCR path, to compare with the shape-based reader.
  const { readCalendarPhoto } = await import(`${CORE}/src/import/photo.ts`);
  const { execFileSync } = await import('node:child_process');
  mkdirSync(join(HERE, 'out/clean'), { recursive: true });
  for (const f of fixtures as any[]) {
    const img = join(CORE, 'test/fixtures/calendars', f.file);
    const line = execFileSync(join(HERE, 'vision-cli'), ['3000', img], { maxBuffer: 1 << 26 }).toString().trim();
    const o = JSON.parse(line);
    const ocr = { width: o.width, height: o.height, tokens: o.tokens.map((t: any) => ({ text: t.t, x: t.x, y: t.y, w: t.w, h: t.h, confidence: t.c })) };
    const flatten = async (plan: any) => {
      const out = join(HERE, 'out/clean', f.file);
      const pf = join(HERE, 'out/clean', 'plan.json');
      writeFileSync(pf, JSON.stringify([{ image: img, out, h: plan.homography, w: plan.width, hh: plan.height }]));
      execFileSync(join(HERE, 'vision-cli'), ['rectify', '3000', pf]);
      return decodePng(new Uint8Array(readFileSync(out)));
    };
    const r = await readCalendarPhoto(ocr, flatten, { today: f.today });
    const ok = JSON.stringify(r.periods) === JSON.stringify(f.periods);
    console.log(f.file.padEnd(18), r.status.padEnd(9), r.photo.stage, ok ? 'EXACT' : 'DIFF ' + JSON.stringify(r.periods) + ' want ' + JSON.stringify(f.periods), JSON.stringify(r.months));
  }
}
