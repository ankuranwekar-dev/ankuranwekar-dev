/**
 * Reads her period days out of a screenshot of any tracker's month calendar.
 *
 * No server, no OCR model and no knowledge of a particular app: the reader
 * relies on what every month calendar has in common.
 *
 *  1. Day numbers are small, same-height glyphs on a seven-column lattice.
 *     A morphological top-hat pulls thin strokes out of any background, so
 *     white numerals on a red disc and grey numerals on white both survive.
 *  2. Days 1–9 have one glyph and days 10–31 have two. The only place a run
 *     of nine single-glyph cells meets a run of double-glyph cells is the 9th
 *     and 10th, which numbers every cell without recognising a single digit.
 *  3. The column of the 1st plus the month's length identifies the month,
 *     searched backwards from today. Repeated letters in the weekday header
 *     (S·····S, T·T) reveal whether the week starts on Sunday or Monday.
 *  4. Period days are marked in the red-to-pink family in nearly every
 *     tracker; fertile days in a cool colour. Marks are measured per cell
 *     against the page background, grouped by style, and split into logged
 *     and predicted by where they fall relative to today.
 *
 * Everything is checked for plausibility, and the caller is expected to show
 * the result for confirmation before using it.
 */

import { addDays, diffDays, toDayNumber, weekday, type ISODate } from '../dates';
import type { PeriodLog } from '../cycle/types';
import type { Pixels } from './png';

/** 0 = Sunday, 1 = Monday, 6 = Saturday. */
export type WeekStart = 0 | 1 | 6;

export type DayMark = 'period' | 'predicted' | 'fertile' | 'none';

export interface ReadDay {
  date: ISODate;
  mark: DayMark;
}

export interface CalendarReading {
  /** 'ok': safe to prefill. 'unsure': show it, but ask her to check. 'not-found': no month calendar in the image. */
  status: 'ok' | 'unsure' | 'not-found';
  reason?: 'no-grid' | 'no-month' | 'no-period' | 'every-day-coloured';
  /** First day of each month that was read, oldest first. */
  months: ISODate[];
  days: ReadDay[];
  /** Logged periods, oldest first. `end` is omitted while a period is still running or runs off the image. */
  periods: PeriodLog[];
  /** Starts of periods the other app predicts, soonest first. */
  predicted: ISODate[];
  /** The other app's own estimate of her cycle length: next predicted start minus the last logged start. */
  cycleLength?: number;
  weekStart?: WeekStart;
  /** Whether the week start was read off the weekday header or assumed. */
  weekStartFrom?: 'header' | 'device' | 'guess';
  /** 0–1. How well the grid fit a real month, and how clearly it beat the alternatives. */
  confidence: number;
  /** Other months the same grid could be (first day of the topmost month), likeliest first. */
  alternatives?: ISODate[];
}

export interface ReadOptions {
  today: ISODate;
  /** Diagnostics for the benchmark: receives the grid as it was understood. */
  trace?: (grid: { numeralHeight: number; pitch: number; rowPitch: number; rows: string[]; segments: number }) => void;
  /** The device's first day of the week, used when the weekday header cannot settle it. */
  weekStart?: WeekStart;
  /** Narrow weekday names in the device language, Sunday first. Defaults to English. */
  weekdayInitials?: string[];
  /** Read the topmost month in the image as this one (any day in it), when she corrects the guess. */
  firstMonth?: ISODate;
}

const NOT_FOUND = (reason: CalendarReading['reason']): CalendarReading => ({
  status: 'not-found',
  ...(reason ? { reason } : {}),
  months: [],
  days: [],
  periods: [],
  predicted: [],
  confidence: 0,
});

// ---------------------------------------------------------------------------
// Image preparation
// ---------------------------------------------------------------------------

interface Image {
  w: number;
  h: number;
  /** RGB, 3 bytes per pixel. */
  rgb: Uint8Array;
}

const WORKING_WIDTH = 720;

/** Area-average down to the working width; screenshots are 2–3× sharper than the reader needs. */
function prepare(px: Pixels): Image {
  const { width: W, height: H, data } = px;
  const scale = W > WORKING_WIDTH * 1.15 ? W / WORKING_WIDTH : 1;
  const w = Math.floor(W / scale);
  const h = Math.floor(H / scale);
  const rgb = new Uint8Array(w * h * 3);

  if (scale === 1) {
    for (let i = 0, o = 0; i < w * h; i++, o += 3) {
      const p = i * 4;
      const a = data[p + 3]! / 255;
      rgb[o] = data[p]! * a + 255 * (1 - a);
      rgb[o + 1] = data[p + 1]! * a + 255 * (1 - a);
      rgb[o + 2] = data[p + 2]! * a + 255 * (1 - a);
    }
    return { w, h, rgb };
  }

  // Per-axis source spans and edge weights, computed once.
  const span = (n: number, N: number) => {
    const start = new Int32Array(n);
    const end = new Int32Array(n);
    const first = new Float32Array(n);
    const last = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = i * scale;
      const b = Math.min(N, (i + 1) * scale);
      start[i] = Math.floor(a);
      end[i] = Math.min(N - 1, Math.ceil(b) - 1);
      first[i] = 1 - (a - Math.floor(a));
      last[i] = b - Math.floor(b) || 1;
    }
    return { start, end, first, last };
  };
  const xs = span(w, W);
  const ys = span(h, H);

  for (let y = 0; y < h; y++) {
    const y0 = ys.start[y]!;
    const y1 = ys.end[y]!;
    for (let x = 0; x < w; x++) {
      const x0 = xs.start[x]!;
      const x1 = xs.end[x]!;
      let r = 0;
      let g = 0;
      let b = 0;
      let wsum = 0;
      for (let sy = y0; sy <= y1; sy++) {
        const wy = sy === y0 ? ys.first[y]! : sy === y1 ? ys.last[y]! : 1;
        let p = (sy * W + x0) * 4;
        for (let sx = x0; sx <= x1; sx++, p += 4) {
          const wt = wy * (sx === x0 ? xs.first[x]! : sx === x1 ? xs.last[x]! : 1);
          r += data[p]! * wt;
          g += data[p + 1]! * wt;
          b += data[p + 2]! * wt;
          wsum += wt;
        }
      }
      const o = (y * w + x) * 3;
      rgb[o] = r / wsum;
      rgb[o + 1] = g / wsum;
      rgb[o + 2] = b / wsum;
    }
  }
  return { w, h, rgb };
}

/**
 * One channel in which every kind of numeral stands out from what is behind
 * it: the mean of luminance and the smallest of R, G, B. White on red, red on
 * white, black on pink and grey on black all differ by a wide margin.
 */
function contrastChannel(img: Image): Uint8Array {
  const n = img.w * img.h;
  const out = new Uint8Array(n);
  const { rgb } = img;
  for (let i = 0, o = 0; i < n; i++, o += 3) {
    const r = rgb[o]!;
    const g = rgb[o + 1]!;
    const b = rgb[o + 2]!;
    const lum = (77 * r + 150 * g + 29 * b) >> 8;
    const min = r < g ? (r < b ? r : b) : g < b ? g : b;
    out[i] = (lum + min) >> 1;
  }
  return out;
}

/** Sliding-window minimum or maximum along rows or columns (van Herk / Gil-Werman), window `k` (odd). */
function slide(src: Uint8Array, dst: Uint8Array, w: number, h: number, k: number, max: boolean, vertical: boolean) {
  const r = (k - 1) >> 1;
  const n = vertical ? h : w;
  const lines = vertical ? w : h;
  const stride = vertical ? w : 1;
  const m = n + 2 * r;
  const pad = max ? 0 : 255;
  const line = new Uint8Array(m + k);
  const fwd = new Uint8Array(m + k);
  const back = new Uint8Array(m + k);
  for (let l = 0; l < lines; l++) {
    const base = vertical ? l : l * w;
    line.fill(pad);
    for (let i = 0; i < n; i++) line[i + r] = src[base + i * stride]!;
    for (let i = 0; i < m; i++) {
      fwd[i] = i % k === 0 ? line[i]! : max ? Math.max(fwd[i - 1]!, line[i]!) : Math.min(fwd[i - 1]!, line[i]!);
    }
    for (let i = m - 1; i >= 0; i--) {
      back[i] =
        i === m - 1 || (i + 1) % k === 0
          ? line[i]!
          : max
            ? Math.max(back[i + 1]!, line[i]!)
            : Math.min(back[i + 1]!, line[i]!);
    }
    for (let i = 0; i < n; i++) {
      const a = back[i]!;
      const b = fwd[Math.min(m - 1, i + k - 1)]!;
      dst[base + i * stride] = max ? (a > b ? a : b) : a < b ? a : b;
    }
  }
}

interface Ink {
  /** 0 = none, 1 = darker than its surroundings, 2 = lighter. */
  map: Uint8Array;
  /** Top-hat strength at each inked pixel. */
  strength: Uint8Array;
}

const INK_THRESHOLD = 38;

/**
 * What each pixel is "sitting on": the median of its neighbourhood, about two
 * numerals wide. Inside a red disc that is red; on the page it is the page.
 * Computed on a quarter-size copy with a sliding histogram.
 */
function localBackground(c: Uint8Array, w: number, h: number, k: number): { bg: Uint8Array; sw: number; f: number } {
  const f = 4;
  const sw = Math.ceil(w / f);
  const sh = Math.ceil(h / f);
  const small = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      let sum = 0;
      let n = 0;
      for (let yy = y * f; yy < Math.min(h, y * f + f); yy++) {
        for (let xx = x * f; xx < Math.min(w, x * f + f); xx++) {
          sum += c[yy * w + xx]!;
          n++;
        }
      }
      small[y * sw + x] = sum / n;
    }
  }
  const r = Math.max(3, Math.round((2 * k) / f));
  const bg = new Uint8Array(sw * sh);
  const hist = new Int32Array(256);
  for (let y = 0; y < sh; y++) {
    hist.fill(0);
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(sh - 1, y + r);
    let count = 0;
    const add = (x: number, d: number) => {
      for (let yy = y0; yy <= y1; yy++) hist[small[yy * sw + x]!]! += d;
      count += d * (y1 - y0 + 1);
    };
    for (let x = 0; x <= Math.min(sw - 1, r); x++) add(x, 1);
    for (let x = 0; x < sw; x++) {
      if (x > 0) {
        if (x + r < sw) add(x + r, 1);
        if (x - r - 1 >= 0) add(x - r - 1, -1);
      }
      let acc = 0;
      let m = 0;
      const half = count >> 1;
      while (m < 255 && acc + hist[m]! <= half) acc += hist[m++]!;
      bg[y * sw + x] = m;
    }
  }
  return { bg, sw, f };
}

/**
 * Thin strokes that differ from what they sit on. The top-hats find anything
 * thin (black top-hat = closing − image, white top-hat = image − opening);
 * the local background then discards the gaps between strokes, which are thin
 * too but are simply the background showing through.
 */
function findInk(c: Uint8Array, w: number, h: number, k: number): Ink {
  const n = w * h;
  const a = new Uint8Array(n);
  const b = new Uint8Array(n);
  const map = new Uint8Array(n);
  const strength = new Uint8Array(n);
  const { bg, sw, f } = localBackground(c, w, h, k);
  const SIDE = INK_THRESHOLD / 2;

  // Closing: dilate, then erode.
  slide(c, a, w, h, k, true, false);
  slide(a, b, w, h, k, true, true);
  slide(b, a, w, h, k, false, false);
  slide(a, b, w, h, k, false, true);
  for (let y = 0, i = 0; y < h; y++) {
    const row = Math.floor(y / f) * sw;
    for (let x = 0; x < w; x++, i++) {
      const d = b[i]! - c[i]!;
      if (d > INK_THRESHOLD && c[i]! < bg[row + Math.floor(x / f)]! - SIDE) {
        map[i] = 1;
        strength[i] = d;
      }
    }
  }
  // Opening: erode, then dilate.
  slide(c, a, w, h, k, false, false);
  slide(a, b, w, h, k, false, true);
  slide(b, a, w, h, k, true, false);
  slide(a, b, w, h, k, true, true);
  for (let y = 0, i = 0; y < h; y++) {
    const row = Math.floor(y / f) * sw;
    for (let x = 0; x < w; x++, i++) {
      const d = c[i]! - b[i]!;
      if (d > INK_THRESHOLD && d > strength[i]! && c[i]! > bg[row + Math.floor(x / f)]! + SIDE) {
        map[i] = 2;
        strength[i] = d;
      }
    }
  }
  return { map, strength };
}

interface Blob {
  id: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  area: number;
  /** Mean top-hat strength: how strongly the stroke stands out. */
  contrast: number;
}

/** 8-connected components of same-polarity ink. */
function label(ink: Ink, w: number, h: number): { labels: Int32Array; blobs: Blob[] } | null {
  const { map, strength } = ink;
  const labels = new Int32Array(w * h);
  const parent: number[] = [0];
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = map[i]!;
      if (!v) continue;
      let l = 0;
      const join = (j: number) => {
        if (map[j] !== v) return;
        const o = find(labels[j]!);
        if (!l) l = o;
        else if (o !== l) ((parent[Math.max(o, l)] = Math.min(o, l)), (l = Math.min(o, l)));
      };
      if (x > 0) join(i - 1);
      if (y > 0) {
        join(i - w);
        if (x > 0) join(i - w - 1);
        if (x < w - 1) join(i - w + 1);
      }
      if (!l) {
        l = parent.length;
        parent.push(l);
        if (l > 250_000) return null; // noise, not a screenshot
      }
      labels[i] = l;
    }
  }

  const index = new Map<number, Blob>();
  const sums = new Map<number, number>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!labels[i]) continue;
      const root = find(labels[i]!);
      labels[i] = root;
      let b = index.get(root);
      if (!b) {
        b = { id: root, x0: x, y0: y, x1: x, y1: y, area: 0, contrast: 0 };
        index.set(root, b);
        sums.set(root, 0);
      }
      if (x < b.x0) b.x0 = x;
      if (x > b.x1) b.x1 = x;
      if (y > b.y1) b.y1 = y;
      b.area++;
      sums.set(root, sums.get(root)! + strength[i]!);
    }
  }
  const blobs = [...index.values()];
  for (const b of blobs) b.contrast = sums.get(b.id)! / b.area;
  return { labels, blobs };
}

// ---------------------------------------------------------------------------
// Numbers and the lattice they sit on
// ---------------------------------------------------------------------------

interface Token {
  blobs: Blob[];
  digits: 1 | 2;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  contrast: number;
}

const bw = (b: Blob) => b.x1 - b.x0 + 1;
const bh = (b: Blob) => b.y1 - b.y0 + 1;

/**
 * Numerals of one size are not all exactly one height: round ones overshoot, bold ones (today,
 * period days) are a touch taller, and re-compression shaves a pixel here and there.
 */
const heightTolerance = (h0: number) => Math.max(2, Math.round(h0 * 0.15));

/** The most common glyph heights. Lining numerals all share one height; letters do not. */
function heightModes(blobs: Blob[], w: number): number[] {
  const maxH = Math.round(w * 0.09);
  const hist = new Int32Array(maxH + 2);
  for (const b of blobs) {
    const hh = bh(b);
    const ww = bw(b);
    if (hh < 7 || hh > maxH || ww > 1.7 * hh || b.area < 0.12 * ww * hh) continue;
    hist[hh]!++;
  }
  const scored: { h: number; n: number }[] = [];
  for (let h0 = 7; h0 <= maxH; h0++) {
    const tol = heightTolerance(h0);
    let n = 0;
    for (let d = -tol; d <= tol; d++) n += hist[h0 + d] ?? 0;
    if (n >= 10) scored.push({ h: h0, n });
  }
  scored.sort((a, b) => b.n - a.n || a.h - b.h);
  const picked: number[] = [];
  for (const s of scored) {
    if (picked.every((p) => Math.abs(p - s.h) > Math.max(3, 0.25 * p))) picked.push(s.h);
    if (picked.length === 4) break;
  }
  return picked;
}

/** Groups glyphs of height ~h0 into one- and two-digit numbers; longer runs are words and are dropped. */
function tokens(blobs: Blob[], h0: number): Token[] {
  const tol = heightTolerance(h0);
  const glyphs = blobs
    .filter((b) => Math.abs(bh(b) - h0) <= tol && bw(b) <= 1.7 * h0 && b.area >= 0.12 * bw(b) * bh(b))
    .sort((a, b) => a.x0 - b.x0);
  // Anything letter-sized, whatever its height, for telling numbers from words. The floor is just
  // under x-height, which keeps out the dashes of a dashed ring drawn around a numeral.
  const letters = blobs
    .filter((b) => bh(b) >= 0.62 * h0 && bh(b) <= 1.9 * h0 && bw(b) <= 2.2 * h0 && b.area >= 0.1 * bw(b) * bh(b))
    .sort((a, b) => a.x0 - b.x0);
  const used = new Set<number>();
  const out: Token[] = [];
  for (let i = 0; i < glyphs.length; i++) {
    const first = glyphs[i]!;
    if (used.has(first.id)) continue;
    const run = [first];
    used.add(first.id);
    let tail = first;
    for (let j = i + 1; j < glyphs.length; j++) {
      const g = glyphs[j]!;
      if (used.has(g.id)) continue;
      const gap = g.x0 - tail.x1 - 1;
      if (gap > 0.45 * h0) {
        if (g.x0 - tail.x1 > h0) break;
        continue;
      }
      const overlap = Math.min(g.y1, tail.y1) - Math.max(g.y0, tail.y0) + 1;
      if (gap < -1 || overlap < 0.6 * h0) continue;
      run.push(g);
      used.add(g.id);
      tail = g;
    }
    if (run.length > 2) continue;
    const x0 = run[0]!.x0;
    const x1 = tail.x1;
    const y0 = Math.min(...run.map((r) => r.y0));
    const y1 = Math.max(...run.map((r) => r.y1));
    // A letter of another height right beside it means this is part of a word ("Cycle", "of 29").
    const inRun = new Set(run.map((r) => r.id));
    const reach = 0.5 * h0; // a word space
    let word = false;
    for (const o of letters) {
      if (o.x0 > x1 + reach + 1) break;
      if (inRun.has(o.id) || o.x1 < x0 - reach - 1) continue;
      if (o.x0 <= x1 && o.x1 >= x0) continue; // overlaps the numeral itself: a ring or a disc edge, not a letter
      const overlap = Math.min(o.y1, y1) - Math.max(o.y0, y0) + 1;
      if (overlap >= 0.5 * Math.min(h0, bh(o))) {
        word = true;
        break;
      }
    }
    if (word) continue;
    // Two numerals can fuse into one blob after downscaling; width gives them away.
    const digits: 1 | 2 = run.length === 2 || x1 - x0 + 1 > 1.02 * h0 ? 2 : 1;
    out.push({
      blobs: run,
      digits,
      x0,
      y0,
      x1,
      y1,
      cx: (x0 + x1) / 2,
      cy: (y0 + y1) / 2,
      contrast: run.reduce((s, r) => s + r.contrast * r.area, 0) / run.reduce((s, r) => s + r.area, 0),
    });
  }
  return out;
}

/** Rows of one month sit on an exact pitch; a title or a gap between months does not. */
const pitchTolerance = (rowPitch: number) => Math.max(2.5, 0.045 * rowPitch);

interface Row {
  y: number;
  cells: (Token | undefined)[];
  count: number;
}

interface Lattice {
  pitch: number;
  x0: number;
  rowPitch: number;
  rows: Row[];
  h0: number;
  score: number;
}

/** Finds the seven evenly spaced columns that the most numbers are centred on, then the rows. */
function fitLattice(toks: Token[], w: number, h0: number): Lattice | null {
  if (toks.length < 12) return null;
  let best = { score: 0, pitch: 0, x0: 0 };
  for (let pitch = w / 13; pitch <= w / 6.2; pitch += 0.5) {
    const tol = 0.11 * pitch;
    const phases = toks.map((t) => t.cx % pitch).sort((a, b) => a - b);
    // Densest circular window of phases.
    let bestN = 0;
    let bestPhase = 0;
    const n = phases.length;
    let j = 0;
    for (let i = 0; i < n; i++) {
      while (j < i + n && (j < n ? phases[j]! : phases[j - n]! + pitch) - phases[i]! <= 2 * tol) j++;
      if (j - i > bestN) {
        bestN = j - i;
        let sum = 0;
        for (let q = i; q < j; q++) sum += q < n ? phases[q]! : phases[q - n]! + pitch;
        bestPhase = (sum / (j - i)) % pitch;
      }
    }
    if (bestN < best.score) continue;
    // Seven consecutive columns holding the most numbers.
    const columns = Math.floor((w - bestPhase) / pitch) + 1;
    const counts = new Int32Array(columns);
    for (const t of toks) {
      const c = Math.round((t.cx - bestPhase) / pitch);
      if (c >= 0 && c < columns && Math.abs(t.cx - (bestPhase + c * pitch)) <= tol) counts[c]!++;
    }
    for (let s = 0; s + 7 <= columns; s++) {
      let sum = 0;
      let filled = 0;
      for (let c = s; c < s + 7; c++) {
        sum += counts[c]!;
        if (counts[c]! >= 2) filled++;
      }
      if (filled >= 6 && sum > best.score) best = { score: sum, pitch, x0: bestPhase + s * pitch };
    }
  }
  if (best.score < 12) return null;

  // Refine pitch and origin by least squares on the assigned numbers.
  let { pitch, x0 } = best;
  for (let pass = 0; pass < 2; pass++) {
    let n = 0;
    let sc = 0;
    let sx = 0;
    let scc = 0;
    let scx = 0;
    for (const t of toks) {
      const c = Math.round((t.cx - x0) / pitch);
      if (c < 0 || c > 6 || Math.abs(t.cx - (x0 + c * pitch)) > 0.14 * pitch) continue;
      n++;
      sc += c;
      sx += t.cx;
      scc += c * c;
      scx += c * t.cx;
    }
    const den = n * scc - sc * sc;
    if (den > 0) {
      pitch = (n * scx - sc * sx) / den;
      x0 = (sx - pitch * sc) / n;
    }
  }

  // Rows: cluster the assigned numbers by vertical centre.
  const assigned: { t: Token; col: number }[] = [];
  for (const t of toks) {
    const col = Math.round((t.cx - x0) / pitch);
    if (col >= 0 && col <= 6 && Math.abs(t.cx - (x0 + col * pitch)) <= 0.14 * pitch) assigned.push({ t, col });
  }
  assigned.sort((a, b) => a.t.cy - b.t.cy);
  const rows: Row[] = [];
  let current: { ys: number[]; items: { t: Token; col: number }[] } | null = null;
  const flush = () => {
    if (!current) return;
    const y = current.ys.reduce((s, v) => s + v, 0) / current.ys.length;
    const cells: (Token | undefined)[] = new Array(7).fill(undefined);
    for (const it of current.items) {
      const prev = cells[it.col];
      if (!prev || Math.abs(it.t.cx - (x0 + it.col * pitch)) < Math.abs(prev.cx - (x0 + it.col * pitch))) {
        cells[it.col] = it.t;
      }
    }
    rows.push({ y, cells, count: cells.filter(Boolean).length });
  };
  for (const a of assigned) {
    if (current && a.t.cy - current.ys[current.ys.length - 1]! <= 0.5 * h0) {
      current.ys.push(a.t.cy);
      current.items.push(a);
    } else {
      flush();
      current = { ys: [a.t.cy], items: [a] };
    }
  }
  flush();
  if (rows.length < 2) return null;

  // Two rows of dates cannot be closer than this; the weaker one is a row of icons under the numerals.
  const prune = (minGap: number) => {
    for (let i = 1; i < rows.length; ) {
      if (rows[i]!.y - rows[i - 1]!.y >= minGap) i++;
      else rows.splice(rows[i]!.count > rows[i - 1]!.count ? i - 1 : i, 1);
    }
  };
  prune(0.45 * pitch);

  // Row pitch: the most common distance between well-filled rows, neighbours or not, so that a
  // stray row between two real ones cannot hide it.
  const gaps: number[] = [];
  const solid = rows.filter((r) => r.count >= 3);
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const g = solid[j]!.y - solid[i]!.y;
      if (g > 0.45 * pitch && g < 1.7 * pitch) gaps.push(g);
    }
  }
  if (gaps.length === 0) return null;
  let rowPitch = gaps[0]!;
  let support = 0;
  for (const g of gaps) {
    const n = gaps.filter((o) => Math.abs(o - g) <= pitchTolerance(g)).length;
    if (n > support || (n === support && g > rowPitch)) {
      support = n;
      rowPitch = g;
    }
  }
  const near = gaps.filter((o) => Math.abs(o - rowPitch) <= pitchTolerance(rowPitch));
  rowPitch = near.reduce((sum, v) => sum + v, 0) / near.length;
  prune(0.7 * rowPitch);

  // A row with a single number counts only next to a real row (the 1st alone on a Saturday, the 31st on a Sunday).
  const onPitch = (a: number, b: number) => Math.abs(Math.abs(a - b) - rowPitch) <= pitchTolerance(rowPitch);
  const kept = rows.filter(
    (r) =>
      r.count >= 2 || ((r.cells[0] || r.cells[6]) && rows.some((o) => o !== r && o.count >= 2 && onPitch(o.y, r.y))),
  );
  // Only rows with a neighbour one pitch away count towards the fit: that is what a month looks
  // like, and it stops a lone row of weekday letters from tipping the choice of numeral height.
  const score = kept.filter((r) => kept.some((o) => o !== r && onPitch(o.y, r.y))).reduce((sum, r) => sum + r.count, 0);
  if (kept.length < 2 || score < 12) return null;
  return { pitch, x0, rowPitch, rows: kept, h0, score };
}

interface Cell {
  slot: number;
  token: Token;
  row: Row;
  col: number;
}

interface Segment {
  cells: Cell[];
  rows: number;
  /** Where the next row of dates would be, the page is visibly empty: the month ends here. */
  blankBelow?: boolean;
  blankAbove?: boolean;
}

/** Splits rows into month blocks: wherever the spacing breaks, or one month's last row meets the next one's first. */
function segments(lat: Lattice): Segment[] {
  const all: Segment[] = [];
  let rowIndex = 0;
  let cells: Cell[] = [];
  let prev: Row | undefined;
  const flush = () => {
    if (cells.length) all.push({ cells, rows: rowIndex });
    cells = [];
    rowIndex = 0;
  };
  for (const row of lat.rows) {
    if (prev) {
      const gap = row.y - prev.y;
      const regular = Math.abs(gap - lat.rowPitch) <= pitchTolerance(lat.rowPitch);
      // One month ends mid-week and the next begins on the following weekday, one row down.
      let lastOfPrev = 6;
      while (lastOfPrev >= 0 && !prev.cells[lastOfPrev]) lastOfPrev--;
      const firstOfRow = row.cells.findIndex(Boolean);
      const junction = lastOfPrev < 6 && firstOfRow > lastOfPrev;
      if (!regular || junction) flush();
    }
    for (let col = 0; col < 7; col++) {
      const token = row.cells[col];
      if (token) cells.push({ slot: rowIndex * 7 + col, token, row, col });
    }
    rowIndex++;
    prev = row;
  }
  flush();

  // A block of under four numbers is kept only at either end, and only if it is plainly the
  // start of the next month (single digits, on the weekday after the previous block ends) or the
  // end of the previous one. Anywhere else it is a stray.
  // A lone row at the top can only be the last week of a month (all two-digit days). One with
  // single glyphs in it is the weekday header, whose letters happen to be numeral-sized.
  if (all.length > 1 && all[0]!.rows === 1 && all[0]!.cells.some((c) => c.token.digits === 1)) all.shift();

  const follows = (a: Segment, b: Segment) => (a.cells[a.cells.length - 1]!.col + 1) % 7 === b.cells[0]!.col;
  const unbroken = (seg: Segment) => seg.cells.every((c, i) => i === 0 || c.slot === seg.cells[i - 1]!.slot + 1);
  return all.filter((seg, i) => {
    if (seg.cells.length >= 4) return true;
    const before = all[i - 1];
    const after = all[i + 1];
    if (i === all.length - 1 && before && before.cells.length >= 4) {
      return seg.cells.every((c) => c.token.digits === 1) && unbroken(seg) && follows(before, seg);
    }
    if (i === 0 && after && after.cells.length >= 4) {
      return seg.cells.every((c) => c.token.digits === 2) && unbroken(seg) && follows(seg, after);
    }
    return false;
  });
}

// ---------------------------------------------------------------------------
// Which month is it?
// ---------------------------------------------------------------------------

/** Months since year 0, so month arithmetic is plain integer arithmetic. */
const monthIndex = (iso: ISODate) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const monthStart = (m: number): ISODate =>
  `${String(Math.floor(m / 12)).padStart(4, '0')}-${String((m % 12) + 1).padStart(2, '0')}-01`;
const monthLength = (m: number) => diffDays(monthStart(m), monthStart(m + 1));

interface SegmentFit {
  cost: number;
  /** Slot holding the 1st of the hypothesised month. */
  s1: number;
  mismatches: number;
}

function fitSegment(
  seg: Segment,
  m: number,
  ws: WeekStart,
  dimBelow: number,
  /** Another month block sits above / below, so this one is not cut off by the edge of the image. */
  bounded: { above: boolean; below: boolean },
): SegmentFit {
  const n = monthLength(m);
  const prevLen = monthLength(m - 1);
  const c1 = (weekday(monthStart(m)) - ws + 7) % 7;
  const present = new Set(seg.cells.map((c) => c.slot));
  let best: SegmentFit = { cost: Infinity, s1: 0, mismatches: 0 };
  for (let j = -6; j <= 5; j++) {
    const s1 = c1 + 7 * j;
    let cost = 0;
    let mismatches = 0;
    let inMonth = 0;
    for (const c of seg.cells) {
      let day: number;
      let outside = false;
      if (c.slot < s1) {
        day = prevLen - (s1 - c.slot) + 1;
        outside = true;
        if (day < 1) cost += 2;
      } else if (c.slot >= s1 + n) {
        day = c.slot - s1 - n + 1;
        outside = true;
        if (day > 14) cost += 2;
      } else {
        day = c.slot - s1 + 1;
        inMonth++;
      }
      if ((day >= 10 ? 2 : 1) !== c.token.digits) {
        cost += 1;
        mismatches++;
      }
      // Days of the neighbouring months are normally greyed out; full-strength ones are suspicious.
      if (outside) cost += c.token.contrast < dimBelow ? 0.1 : 0.45;
    }
    if (inMonth === 0) continue;
    // Holes: a day of this month that should be on a visible row but has no number.
    for (let slot = Math.max(0, s1); slot < Math.min(seg.rows * 7, s1 + n); slot++) {
      if (!present.has(slot)) cost += 0.5;
    }
    // A block with another block beyond it, or with empty page where its next row would be,
    // must show the month to its end (or from its start).
    if ((bounded.above || seg.blankAbove) && s1 < 0) cost += Math.min(6, -s1);
    if ((bounded.below || seg.blankBelow) && s1 + n > seg.rows * 7) cost += Math.min(6, s1 + n - seg.rows * 7);
    if (cost < best.cost) best = { cost, s1, mismatches };
  }
  return best;
}

interface MonthFit {
  ws: WeekStart;
  first: number;
  fits: SegmentFit[];
  cost: number;
}

function fitMonths(
  segs: Segment[],
  today: ISODate,
  dimBelow: number,
  wsCost: (ws: WeekStart) => number,
  only?: number,
  hint?: (m: number, i: number) => number,
): MonthFit[] {
  const cur = monthIndex(today);
  const out: MonthFit[] = [];
  for (const ws of [0, 1, 6] as WeekStart[]) {
    for (let first = only ?? cur - 14; first <= (only ?? cur + 3); first++) {
      const fits = segs.map((s, i) =>
        fitSegment(s, first + i, ws, dimBelow, { above: i > 0, below: i < segs.length - 1 }),
      );
      let cost = fits.reduce((s, f) => s + f.cost, 0) + wsCost(ws);
      if (hint) for (let i = 0; i < segs.length; i++) cost += hint(first + i, i);
      const last = first + segs.length - 1;
      // Screenshots are nearly always of this month or a recent one.
      if (last < cur) cost += 0.5 * (cur - last);
      else if (first > cur) cost += 1.5 * (first - cur);
      if (Number.isFinite(cost)) out.push({ ws, first, fits, cost });
    }
  }
  return out.sort((a, b) => a.cost - b.cost);
}

/**
 * Week start from the weekday header, without reading it: which columns
 * carry the same letter depends on where the week begins.
 */
function headerWeekStart(
  blobs: Blob[],
  ink: Ink,
  w: number,
  lat: Lattice,
  dateBlobs: Set<number>,
  initials: string[],
  /** Vertical centre of the first row of dates. */
  firstRowY: number,
): WeekStart | undefined {
  const top = firstRowY - 0.5 * lat.rowPitch;
  const candidates = blobs.filter(
    (b) =>
      !dateBlobs.has(b.id) &&
      b.y1 < top &&
      bh(b) >= 0.35 * lat.h0 &&
      bh(b) <= 1.5 * lat.h0 &&
      bw(b) <= 2 * lat.h0 &&
      b.area >= 6,
  );
  // Rows of header text: cluster by vertical centre.
  candidates.sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));
  const lines: Blob[][] = [];
  for (const b of candidates) {
    const cy = (b.y0 + b.y1) / 2;
    const line = lines[lines.length - 1];
    const lastCy = line ? (line[line.length - 1]!.y0 + line[line.length - 1]!.y1) / 2 : -Infinity;
    if (line && cy - lastCy <= 0.4 * lat.h0) line.push(b);
    else lines.push([b]);
  }

  const shape = (b: Blob): number[] => {
    const GX = 6;
    const GY = 8;
    const v = new Array<number>(GX * GY).fill(0);
    const ww = bw(b);
    const hh = bh(b);
    for (let y = b.y0; y <= b.y1; y++) {
      for (let x = b.x0; x <= b.x1; x++) {
        if (!ink.map[y * w + x]) continue;
        const gx = Math.min(GX - 1, Math.floor(((x - b.x0) / ww) * GX));
        const gy = Math.min(GY - 1, Math.floor(((y - b.y0) / hh) * GY));
        v[gy * GX + gx]!++;
      }
    }
    const cellArea = (ww / GX) * (hh / GY);
    return v.map((c) => c / cellArea);
  };
  const similarity = (a: Blob, b: Blob): number => {
    const va = shape(a);
    const vb = shape(b);
    let dot = 0;
    let na = 0;
    let nb = 0;
    for (let i = 0; i < va.length; i++) {
      dot += va[i]! * vb[i]!;
      na += va[i]! * va[i]!;
      nb += vb[i]! * vb[i]!;
    }
    const aspect = Math.abs(bw(a) / bh(a) - bw(b) / bh(b));
    return dot / Math.sqrt(na * nb || 1) - 0.8 * aspect;
  };

  // The header is the first line from the top with a letter over every column; anything lower
  // that also spans the columns is a row of dates cut off by the header.
  for (const line of lines) {
    // The leftmost glyph near each column centre is that weekday's first letter.
    const firsts: (Blob | undefined)[] = new Array(7).fill(undefined);
    const perColumn = new Array<number>(7).fill(0);
    let stray = 0;
    for (const b of line) {
      const cx = (b.x0 + b.x1) / 2;
      const col = Math.round((cx - lat.x0) / lat.pitch);
      if (col < 0 || col > 6 || Math.abs(cx - (lat.x0 + col * lat.pitch)) > 0.3 * lat.pitch) {
        stray++;
        continue;
      }
      perColumn[col]!++;
      if (!firsts[col] || b.x0 < firsts[col]!.x0) firsts[col] = b;
    }
    // A weekday header is one to three letters over every column and nothing in between.
    if (firsts.filter(Boolean).length < 7 || stray > 0 || Math.max(...perColumn) > 3) continue;
    const sim: number[][] = [];
    for (let i = 0; i < 7; i++) {
      sim.push([]);
      for (let j = 0; j < 7; j++) sim[i]!.push(i === j ? 1 : similarity(firsts[i]!, firsts[j]!));
    }
    let found: WeekStart | undefined;
    let foundMargin = 0;
    for (const ws of [0, 1, 6] as WeekStart[]) {
      const expected = Array.from({ length: 7 }, (_, i) => initials[(ws + i) % 7]!.toLocaleUpperCase());
      let same = 1;
      let diff = -1;
      let pairs = 0;
      for (let i = 0; i < 7; i++) {
        for (let j = i + 1; j < 7; j++) {
          if (expected[i] === expected[j]) {
            same = Math.min(same, sim[i]![j]!);
            pairs++;
          } else diff = Math.max(diff, sim[i]![j]!);
        }
      }
      // Every pair of equal letters must look alike, and more alike than any pair of different ones.
      const margin = same - diff;
      if (pairs > 0 && same >= 0.85 && margin > 0.06 && margin > foundMargin) {
        found = ws;
        foundMargin = margin;
      }
    }
    return found;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

type Hue = 'red' | 'warm' | 'green' | 'cool' | 'purple';

function hueClass(r: number, g: number, b: number): Hue {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min || 1;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h >= 325 || h < 22) return 'red';
  if (h < 75) return 'warm';
  if (h < 150) return 'green';
  if (h < 265) return 'cool';
  return 'purple';
}

interface Mark {
  hue?: Hue;
  /** Share of the cell (outside the numeral) covered by the mark. */
  cover: number;
  /** How far the mark's colour is from the page, 0–255. */
  strength: number;
  /** Colour of the numeral itself, when it is tinted. */
  glyphHue?: Hue;
}

const HUES: Hue[] = ['red', 'warm', 'green', 'cool', 'purple'];

function pageColour(img: Image, lat: Lattice): [number, number, number] {
  const x0 = Math.max(0, Math.floor(lat.x0 - lat.pitch / 2));
  const x1 = Math.min(img.w - 1, Math.ceil(lat.x0 + 6.5 * lat.pitch));
  const y0 = Math.max(0, Math.floor(lat.rows[0]!.y - lat.rowPitch / 2));
  const y1 = Math.min(img.h - 1, Math.ceil(lat.rows[lat.rows.length - 1]!.y + lat.rowPitch / 2));
  const hist = new Int32Array(32 * 32 * 32);
  for (let y = y0; y <= y1; y += 2) {
    for (let x = x0; x <= x1; x += 2) {
      const o = (y * img.w + x) * 3;
      hist[((img.rgb[o]! >> 3) << 10) | ((img.rgb[o + 1]! >> 3) << 5) | (img.rgb[o + 2]! >> 3)]!++;
    }
  }
  let bin = 0;
  for (let i = 1; i < hist.length; i++) if (hist[i]! > hist[bin]!) bin = i;
  return [((bin >> 10) << 3) + 4, (((bin >> 5) & 31) << 3) + 4, ((bin & 31) << 3) + 4];
}

function measure(img: Image, labels: Int32Array, lat: Lattice, cell: Cell, bg: [number, number, number]): Mark {
  const { token } = cell;
  const cx = lat.x0 + cell.col * lat.pitch;
  const hw = 0.46 * lat.pitch;
  const hh = 0.46 * lat.rowPitch;
  const x0 = Math.max(0, Math.round(cx - hw));
  const x1 = Math.min(img.w - 1, Math.round(cx + hw));
  const y0 = Math.max(0, Math.round(token.cy - hh));
  const y1 = Math.min(img.h - 1, Math.round(token.cy + hh));
  const own = new Set(token.blobs.map((b) => b.id));

  const counts: Record<Hue, number> = { red: 0, warm: 0, green: 0, cool: 0, purple: 0 };
  const dist: Record<Hue, number> = { red: 0, warm: 0, green: 0, cool: 0, purple: 0 };
  let area = 0;
  const glyph = [0, 0, 0, 0];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * img.w + x;
      const o = i * 3;
      const r = img.rgb[o]!;
      const g = img.rgb[o + 1]!;
      const b = img.rgb[o + 2]!;
      if (own.has(labels[i]!)) {
        glyph[0]! += r;
        glyph[1]! += g;
        glyph[2]! += b;
        glyph[3]!++;
        continue;
      }
      // The numeral's anti-aliased fringe is neither page nor mark.
      if (x >= token.x0 - 2 && x <= token.x1 + 2 && y >= token.y0 - 2 && y <= token.y1 + 2) continue;
      area++;
      const d = Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2]));
      if (d <= 30) continue;
      if (Math.max(r, g, b) - Math.min(r, g, b) < 28) continue;
      const hue = hueClass(r, g, b);
      counts[hue]++;
      dist[hue] += d;
    }
  }
  let hue: Hue | undefined;
  for (const h of HUES) if (counts[h] > (hue ? counts[hue] : 0)) hue = h;
  const cover = hue && area ? counts[hue] / area : 0;
  const mark: Mark = { cover, strength: hue ? dist[hue] / counts[hue] : 0 };
  if (hue && cover >= 0.006) mark.hue = hue;
  if (glyph[3]! > 0) {
    const r = glyph[0]! / glyph[3]!;
    const g = glyph[1]! / glyph[3]!;
    const b = glyph[2]! / glyph[3]!;
    if (Math.max(r, g, b) - Math.min(r, g, b) >= 60) mark.glyphHue = hueClass(r, g, b);
  }
  return mark;
}

/** A coarse description of how a day is decorated, so identical-looking days can be grouped. */
function styleOf(m: Mark): string | undefined {
  if (m.hue) {
    const tier = m.cover >= 0.2 ? 'fill' : m.cover >= 0.035 ? 'ring' : 'dot';
    return `${m.hue}:${tier}`;
  }
  if (m.glyphHue) return `${m.glyphHue}:text`;
  return undefined;
}

// ---------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------

const ENGLISH_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function readCalendarImage(pixels: Pixels, options: ReadOptions): CalendarReading {
  const { today } = options;
  if (pixels.width < 200 || pixels.height < 200) return NOT_FOUND('no-grid');
  const img = prepare(pixels);
  const channel = contrastChannel(img);

  // Find the numerals. The structuring element should be about half a numeral tall; start from a
  // typical phone layout and correct once if the numerals turn out to be much larger or smaller.
  let k = Math.max(7, Math.round(img.w * 0.016) | 1);
  let ink!: Ink;
  let labelled!: { labels: Int32Array; blobs: Blob[] };
  let lat: Lattice | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    ink = findInk(channel, img.w, img.h, k);
    const l = label(ink, img.w, img.h);
    if (!l) return NOT_FOUND('no-grid');
    labelled = l;
    lat = null;
    // The modes say roughly where the numerals are; other text of a similar size can pull a mode
    // off-centre, so try the heights around each one and keep whichever fills the grid best.
    const tried = new Set<number>();
    for (const mode of heightModes(l.blobs, img.w)) {
      for (let h0 = Math.max(7, mode - 3); h0 <= mode + 3; h0++) {
        if (tried.has(h0)) continue;
        tried.add(h0);
        const candidate = fitLattice(tokens(l.blobs, h0), img.w, h0);
        if (candidate && (!lat || candidate.score > lat.score)) lat = candidate;
      }
    }
    if (!lat) break;
    const ideal = Math.max(7, Math.round(lat.h0 * 0.55) | 1);
    if (k >= 0.38 * lat.h0 && k <= 0.85 * lat.h0) break;
    k = ideal;
  }
  if (!lat) return NOT_FOUND('no-grid');
  const grid = lat;

  const segs = segments(grid);
  const dateBlobs = new Set(segs.flatMap((s) => s.cells).flatMap((c) => c.token.blobs.map((b) => b.id)));
  return interpret(
    {
      img,
      lat: grid,
      segs,
      // Is the band where a block's next (or previous) row would sit empty page?
      blank: (y: number): boolean => {
        const y0 = Math.round(y - grid.h0);
        const y1 = Math.round(y + grid.h0);
        if (y0 < 0 || y1 >= img.h) return false;
        const x0 = Math.max(0, Math.round(grid.x0 - grid.pitch / 2));
        const x1 = Math.min(img.w - 1, Math.round(grid.x0 + 6.5 * grid.pitch));
        let n = 0;
        for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if (ink.map[yy * img.w + xx]) n++;
        return n < 12;
      },
      weekStartOf: (rowY) =>
        headerWeekStart(
          labelled.blobs,
          ink,
          img.w,
          grid,
          dateBlobs,
          options.weekdayInitials?.length === 7 ? options.weekdayInitials : ENGLISH_INITIALS,
          rowY,
        ),
      measure: (cell, bg) => measure(img, labelled.labels, grid, cell, bg),
      trimHeaderRow: true,
    },
    options,
  );
}

/** Everything the interpretation needs, whether the grid came from glyph shapes or from a text recogniser. */
interface Scene {
  img: Image;
  lat: Lattice;
  segs: Segment[];
  /** True when the page is plainly empty around `y`, false when it is not or is cut off by the image edge. */
  blank: (y: number) => boolean;
  /** Week start read off the weekday header above the first row, when it can be read. */
  weekStartOf: (firstRowY: number) => WeekStart | undefined;
  measure: (cell: Cell, bg: [number, number, number]) => Mark;
  /** The weekday header can pass for a row of single-digit dates when numerals are found by shape. */
  trimHeaderRow: boolean;
  /** Extra cost for reading block `i` as month `m` (months since year 0), e.g. from a month title. */
  monthHint?: (m: number, i: number) => number;
  /** A cell for `slot` of `seg` where the recogniser found no numeral, if that place is inside the image. */
  synthesize?: (seg: Segment, slot: number) => Cell | undefined;
}

function interpret(scene: Scene, options: ReadOptions): CalendarReading {
  const { today } = options;
  const { img, lat, segs } = scene;
  const cells = segs.flatMap((s) => s.cells);
  for (const seg of segs) {
    seg.blankAbove = scene.blank(seg.cells[0]!.row.y - lat.rowPitch);
    seg.blankBelow = scene.blank(seg.cells[seg.cells.length - 1]!.row.y + lat.rowPitch);
  }
  options.trace?.({
    numeralHeight: lat.h0,
    pitch: lat.pitch,
    rowPitch: lat.rowPitch,
    rows: lat.rows.map((r) => `${Math.round(r.y)}: ${r.cells.map((c) => (c ? c.digits : '.')).join(' ')}`),
    segments: segs.length,
  });
  if (cells.length < 12) return NOT_FOUND('no-grid');

  // Greyed-out numerals (neighbouring months) stand out less than the rest.
  const contrasts = cells.map((c) => c.token.contrast).sort((a, b) => a - b);
  const dimBelow = 0.62 * contrasts[Math.floor(contrasts.length * 0.6)]!;

  const fromHeader = scene.weekStartOf(cells[0]!.row.y);
  const hint = options.weekStart;
  const wsCost = (ws: WeekStart) => {
    if (fromHeader !== undefined) return ws === fromHeader ? 0 : 4;
    if (hint !== undefined) return ws === hint ? 0 : ws === 6 ? 1.2 : 0.8;
    return ws === 6 ? 0.8 : 0;
  };

  const forced = options.firstMonth ? monthIndex(options.firstMonth) : undefined;
  let ranked = fitMonths(segs, today, dimBelow, wsCost, forced, scene.monthHint);
  // The weekday header can sit exactly one row above the dates and pass for a row of them. If
  // the grid reads clearly better without its top row, that row was the header.
  const top = segs[0]!;
  if (scene.trimHeaderRow && top.rows > 2) {
    const firstRow = top.cells[0]!.row;
    const trimmed: Segment = {
      ...top,
      rows: top.rows - 1,
      cells: top.cells.filter((c) => c.row !== firstRow).map((c) => ({ ...c, slot: c.slot - 7 })),
      blankAbove: false,
    };
    const without = [trimmed, ...segs.slice(1)];
    const alt = fitMonths(without, today, dimBelow, wsCost, forced, scene.monthHint);
    if (alt[0] && ranked[0] && alt[0].cost + 3 < ranked[0].cost) {
      segs.splice(0, 1, trimmed);
      ranked = alt;
    }
  }
  const best = ranked[0];
  if (!best) return NOT_FOUND('no-month');
  const mismatches = best.fits.reduce((s, f) => s + f.mismatches, 0);
  const fitCost = best.fits.reduce((s, f) => s + f.cost, 0);

  // Give every cell its date. Greyed days of neighbouring months are left out: apps differ on
  // whether they decorate them, so they prove nothing either way.
  const dated: { date: ISODate; cell: Cell }[] = [];
  segs.forEach((seg, i) => {
    const first = monthStart(best.first + i);
    const length = monthLength(best.first + i);
    for (const cell of seg.cells) {
      const day = cell.slot - best.fits[i]!.s1;
      if (day >= 0 && day < length) dated.push({ date: addDays(first, day), cell });
    }
  });
  if (scene.synthesize) {
    // A numeral the recogniser missed (white on a dark disc is the usual one) is still a day with a place on the grid.
    segs.forEach((seg, i) => {
      const first = monthStart(best.first + i);
      const length = monthLength(best.first + i);
      const s1 = best.fits[i]!.s1;
      const have = new Set(seg.cells.map((c) => c.slot));
      const lastSlot = Math.max(seg.rows * 7 - 1, s1 + length - 1);
      for (let slot = Math.max(0, s1); slot <= Math.min(lastSlot, seg.rows * 7 + 13); slot++) {
        const day = slot - s1;
        if (day < 0 || day >= length || have.has(slot)) continue;
        const cell = scene.synthesize!(seg, slot);
        if (cell) dated.push({ date: addDays(first, day), cell });
      }
    });
  }
  dated.sort((a, b) => (a.date < b.date ? -1 : 1));
  const dateOf = (m: MonthFit) => {
    const key: string[] = [];
    segs.forEach((seg, i) => key.push(addDays(monthStart(m.first + i), seg.cells[0]!.slot - m.fits[i]!.s1)));
    return key.join(',');
  };
  const mine = dateOf(best);
  const rival = ranked.find((r) => dateOf(r) !== mine);
  const margin = rival ? rival.cost - best.cost : 10;

  const matchRate = 1 - mismatches / cells.length;
  const confidence = Math.max(
    0,
    Math.min(1, matchRate - Math.max(0, fitCost - mismatches) / (2 * cells.length)) * Math.min(1, margin / 2),
  );
  const months = segs.map((_, i) => monthStart(best.first + i));
  const alternatives = [
    ...new Set(
      ranked
        .filter((r) => r.first !== best.first && r.cost - best.cost < 2.5)
        .slice(0, 6)
        .map((r) => monthStart(r.first)),
    ),
  ].slice(0, 3);
  const base = {
    months,
    weekStart: best.ws,
    weekStartFrom: fromHeader !== undefined ? 'header' : hint !== undefined ? 'device' : 'guess',
    confidence,
    ...(alternatives.length ? { alternatives } : {}),
  } as const;
  if (matchRate < 0.8) return { ...NOT_FOUND('no-month'), ...base };

  // Marks.
  const bg = pageColour(img, lat);
  const marks = dated.map((d) => ({ ...d, mark: scene.measure(d.cell, bg) }));
  const seen = new Set(marks.map((m) => m.date));
  // Days that should be on a visible row but whose numeral was not found.
  const holes = new Set<ISODate>();
  segs.forEach((seg, i) => {
    const first = monthStart(best.first + i);
    const length = monthLength(best.first + i);
    for (let slot = 0; slot < seg.rows * 7; slot++) {
      const day = slot - best.fits[i]!.s1;
      if (day >= 0 && day < length && !seen.has(addDays(first, day))) holes.add(addDays(first, day));
    }
  });

  const byStyle = new Map<string, typeof marks>();
  for (const m of marks) {
    const s = styleOf(m.mark);
    if (!s) continue;
    if (!byStyle.has(s)) byStyle.set(s, []);
    byStyle.get(s)!.push(m);
  }
  // A decoration on nearly half the days is the calendar's default look, not information.
  let everyDayColoured = false;
  for (const [style, group] of byStyle) {
    if (group.length > 0.45 * marks.length) {
      byStyle.delete(style);
      everyDayColoured = true;
    }
  }

  // Red-family styles. Within one, a clear two-way split in how strong or how dense the mark is
  // separates logged from predicted days (vivid disc vs pale disc, solid ring vs dashed ring).
  type Marked = (typeof marks)[number];
  const split = (group: Marked[], key: (m: Mark) => number): Marked[][] => {
    const sorted = [...group].sort((x, y) => key(x.mark) - key(y.mark));
    const lo = key(sorted[0]!.mark);
    const hi = key(sorted[sorted.length - 1]!.mark);
    if (sorted.length < 2 || hi < 1.4 * lo) return [group];
    let at = 0;
    let gap = 0;
    for (let i = 1; i < sorted.length; i++) {
      const g = key(sorted[i]!.mark) - key(sorted[i - 1]!.mark);
      if (g > gap) {
        gap = g;
        at = i;
      }
    }
    return gap >= 0.45 * (hi - lo) ? [sorted.slice(0, at), sorted.slice(at)] : [group];
  };
  const redGroups: Marked[][] = [];
  for (const [style, group] of byStyle) {
    if (!style.startsWith('red:')) continue;
    if (style.endsWith(':text')) redGroups.push(group);
    else if (style.endsWith(':ring')) {
      // Only outlines are split by density; a disc half-hidden under a sticky header also covers
      // less of its cell, and that must not turn it into a "prediction".
      for (const g of split(group, (m) => m.strength)) redGroups.push(...split(g, (m) => m.cover));
    } else redGroups.push(...split(group, (m) => m.strength));
  }

  // With one style, the date decides: up to today is logged, later is predicted. With several,
  // the heaviest style is the logged one; lighter styles are predictions, except where a lighter
  // day continues a logged run (apps that shade light-flow days).
  const weight = (g: Marked[]) => {
    const mid = (xs: number[]) => xs.sort((x, y) => x - y)[xs.length >> 1]!;
    return mid(g.map((m) => m.mark.cover || 0.01)) * mid(g.map((m) => m.mark.strength || 60));
  };
  const heaviest = redGroups.length ? redGroups.reduce((x, y) => (weight(y) > weight(x) ? y : x)) : undefined;
  const logged = new Set<ISODate>();
  const predictedDays = new Set<ISODate>();
  const lightPast: ISODate[] = [];
  for (const group of redGroups) {
    for (const g of group) {
      if (g.date > today) predictedDays.add(g.date);
      else if (group === heaviest) logged.add(g.date);
      else lightPast.push(g.date);
    }
  }
  for (let grew = true; grew; ) {
    grew = false;
    for (const d of lightPast) {
      if (!logged.has(d) && (logged.has(addDays(d, -1)) || logged.has(addDays(d, 1)))) {
        logged.add(d);
        grew = true;
      }
    }
  }
  for (const d of lightPast) if (!logged.has(d)) predictedDays.add(d);

  const runs = (set: Set<ISODate>): ISODate[][] => {
    const out: ISODate[][] = [];
    for (const d of [...set].sort()) {
      const last = out[out.length - 1];
      if (last && diffDays(last[last.length - 1]!, d) === 1) last.push(d);
      else out.push([d]);
    }
    return out;
  };

  const multiDayGroups = new Set(
    redGroups.filter((g) => runs(new Set(g.map((x) => x.date))).some((r) => r.length >= 2)),
  );
  const groupOf = (date: ISODate) => redGroups.find((g) => g.some((x) => x.date === date));

  const periods: PeriodLog[] = [];
  for (const run of runs(logged)) {
    const start = run[0]!;
    const end = run[run.length - 1]!;
    if (run.length > 10) continue;
    if (run.length === 1) {
      // A lone red day is a period only if it just began and looks like her other period days;
      // otherwise it is most likely the app's highlight for "today".
      const g = groupOf(start);
      const continues = predictedDays.has(addDays(start, 1)); // the app already expects it to go on
      const justBegan = diffDays(start, today) <= 1 && g && (multiDayGroups.has(g) || continues);
      const cutOff = !seen.has(addDays(start, 1)) && g && multiDayGroups.has(g); // last visible day
      if (!justBegan && !cutOff) continue;
    }
    // A run that touches the top edge of what is visible may have started earlier.
    if (!seen.has(addDays(start, -1)) && !marks.some((m) => m.date < start)) continue;
    const running = end >= today || !seen.has(addDays(end, 1));
    periods.push(running ? { start } : { start, end });
  }

  const lastStart = periods[periods.length - 1]?.start;
  const predicted = runs(predictedDays)
    .filter((r) => r.length >= 2 && r.length <= 10 && seen.has(addDays(r[0]!, -1)))
    .map((r) => r[0]!)
    .filter((d) => !lastStart || diffDays(lastStart, d) >= 15);

  const periodDays = new Set<ISODate>();
  for (const p of periods) {
    for (const d of logged) {
      if (d >= p.start && diffDays(p.start, d) < 11 && (!p.end || d <= p.end)) periodDays.add(d);
    }
  }
  const days: ReadDay[] = marks.map((m) => {
    const style = styleOf(m.mark);
    const live = style && byStyle.has(style);
    const mark: DayMark = periodDays.has(m.date)
      ? 'period'
      : predictedDays.has(m.date)
        ? 'predicted'
        : live && /^(cool|green|purple):/.test(style)
          ? 'fertile'
          : 'none';
    return { date: m.date, mark };
  });

  const reading: CalendarReading = { status: 'ok', ...base, days, periods, predicted };
  if (lastStart && predicted[0]) {
    const length = diffDays(lastStart, predicted[0]);
    if (length >= 20 && length <= 45) reading.cycleLength = length;
  }
  if (everyDayColoured) return { ...reading, status: 'unsure', reason: 'every-day-coloured' };
  if (periods.length === 0) return { ...reading, status: 'unsure', reason: 'no-period' };
  if (confidence < 0.5 || mismatches > 0.08 * cells.length) reading.status = 'unsure';
  // A missed numeral next to a period means its first or last day may be wrong.
  if (holes.size > 0.06 * (seen.size + holes.size)) reading.status = 'unsure';
  for (const p of periods) {
    if (holes.has(addDays(p.start, -1)) || (p.end && holes.has(addDays(p.end, 1)))) reading.status = 'unsure';
  }
  // Cycle starts closer together than any real cycle mean the marks are not periods.
  for (let i = 1; i < periods.length; i++) {
    if (toDayNumber(periods[i]!.start) - toDayNumber(periods[i - 1]!.start) < 15) reading.status = 'unsure';
  }
  return reading;
}

// ---------------------------------------------------------------------------
// From a text recogniser instead of glyph shapes (photographs of a screen)
// ---------------------------------------------------------------------------

/** A day number the text recogniser found, in the flattened image's pixels. */
export interface FlatNumeral {
  value: number;
  /** Centre of the lattice cell it belongs to. */
  x: number;
  y: number;
  /** Size of the numeral's own box. */
  w: number;
  h: number;
  col: number;
  /** Row within the lattice (integer), counted from the month's first week. */
  row: number;
}

export interface FlatBlock {
  /** Column of day 1. */
  first: number;
  numerals: FlatNumeral[];
  /** The month's title as read, when one sits just above the block. */
  heading?: { month: number; year?: number };
}

export interface FlatWord {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the text recogniser and the grid fit say about a flattened calendar image. */
export interface FlatScene {
  /** Pixels between columns, x of column 0's centre, and pixels between rows. */
  pitch: number;
  x0: number;
  rowPitch: number;
  /** Month blocks, top to bottom. */
  blocks: FlatBlock[];
  /** Every recognised word, for the weekday header and for deciding where the page is empty. */
  words: FlatWord[];
}

const WEEKDAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/**
 * A photograph of a screen is dimmer, tinted and hazier than the screenshot it shows. Stretch each channel so
 * the page's own range fills 0–255 again, which brings pale marks back above the reader's thresholds.
 */
function autoLevels(img: Image): void {
  const n = img.w * img.h;
  for (let c = 0; c < 3; c++) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < n; i += 3) hist[img.rgb[i * 3 + c]!]!++;
    const total = Math.ceil(n / 3);
    let acc = 0, lo = 0, hi = 255;
    for (let v = 0; v < 256; v++) { acc += hist[v]!; if (acc >= 0.004 * total) { lo = v; break; } }
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]!; if (acc >= 0.004 * total) { hi = v; break; } }
    if (hi - lo < 60) continue;
    const k = 255 / (hi - lo);
    for (let i = 0; i < n; i++) {
      const o = i * 3 + c;
      img.rgb[o] = Math.max(0, Math.min(255, (img.rgb[o]! - lo) * k));
    }
  }
}

function readFlat(px: Pixels, scene: FlatScene, options: ReadOptions): CalendarReading {
  if (px.width < 200 || px.height < 200) return NOT_FOUND('no-grid');
  const img = prepare(px);
  autoLevels(img);
  const { pitch, x0, rowPitch } = scene;
  if (scene.blocks.length === 0) return NOT_FOUND('no-grid');

  const typical = (f: (n: FlatNumeral) => number) => {
    const xs = scene.blocks.flatMap((b) => b.numerals.map(f)).sort((a, b) => a - b);
    return xs[xs.length >> 1] ?? 0;
  };
  const tw = typical((n) => n.w);
  const th = typical((n) => n.h);

  // Cells for every day between the first and last one read in a block: a numeral the recogniser
  // missed is still a day, and its colours can be measured wherever the lattice puts it.
  const rows: Row[] = [];
  const segs: Segment[] = [];
  for (const block of scene.blocks) {
    const byValue = new Map<number, FlatNumeral>();
    for (const n of block.numerals) if (!byValue.has(n.value)) byValue.set(n.value, n);
    const values = [...byValue.keys()].sort((a, b) => a - b);
    if (values.length === 0) continue;
    const lo = values[0]!;
    const hi = values[values.length - 1]!;
    const rowNo = (v: number) => Math.floor((v - 1 + block.first) / 7);
    const r0 = rowNo(lo);
    const rowAt = new Map<number, Row>();
    const cellsOut: Cell[] = [];
    for (let v = lo; v <= hi; v++) {
      const r = rowNo(v);
      const col = (v - 1 + block.first) % 7;
      const seen = byValue.get(v);
      // Row centre: any numeral of that row is on it.
      let y = seen?.y;
      if (y === undefined) {
        const mate = [...byValue.values()].find((n) => n.row === r);
        if (!mate) continue; // a whole row the recogniser missed; leave it to the month fit to notice
        y = mate.y;
      }
      let row = rowAt.get(r);
      if (!row) {
        row = { y, cells: new Array(7).fill(undefined), count: 0 };
        rowAt.set(r, row);
        rows.push(row);
      }
      const w = seen?.w ?? tw;
      const h = seen?.h ?? th;
      const cx = x0 + col * pitch;
      const token: Token = {
        blobs: [],
        digits: v >= 10 ? 2 : 1,
        x0: Math.round(cx - w / 2),
        x1: Math.round(cx + w / 2),
        y0: Math.round(y - h / 2),
        y1: Math.round(y + h / 2),
        cx,
        cy: y,
        contrast: 1,
      };
      row.cells[col] = token;
      row.count++;
      cellsOut.push({ slot: (r - r0) * 7 + col, token, row, col });
    }
    if (cellsOut.length === 0) continue;
    const rMax = rowNo(hi);
    segs.push({ cells: cellsOut, rows: rMax - r0 + 1 });
  }
  if (segs.length === 0) return NOT_FOUND('no-grid');
  rows.sort((a, b) => a.y - b.y);
  const lat: Lattice = { pitch, x0, rowPitch, rows, h0: Math.max(7, Math.round(th)), score: rows.reduce((s, r) => s + r.count, 0) };

  const words = scene.words;
  const band0 = x0 - pitch / 2;
  const band1 = x0 + 6.5 * pitch;
  const blank = (y: number): boolean => {
    if (y - lat.h0 < 0 || y + lat.h0 >= img.h) return false;
    return !words.some((w) => w.x >= band0 && w.x <= band1 && Math.abs(w.y - y) <= lat.h0);
  };

  const initials = options.weekdayInitials?.length === 7 ? options.weekdayInitials : ENGLISH_INITIALS;
  const weekStartOf = (firstRowY: number): WeekStart | undefined => {
    const head = new Map<number, string[]>();
    for (const w of words) {
      if (w.y >= firstRowY - 0.6 * rowPitch || w.y < firstRowY - 3.4 * rowPitch) continue;
      const col = Math.round((w.x - x0) / pitch);
      if (col < 0 || col > 6 || Math.abs(w.x - (x0 + col * pitch)) > 0.4 * pitch) continue;
      head.set(col, [...(head.get(col) ?? []), w.text.replace(/[.,]/g, '').toLowerCase()]);
    }
    if (head.size < 4) return undefined;
    const score = (ws: WeekStart) => {
      let hit = 0;
      for (const [col, texts] of head) {
        const d = (ws + col) % 7;
        if (texts.some((t) => t === initials[d]!.toLowerCase() || (t.length >= 2 && t.startsWith(WEEKDAY_NAMES[d]!.slice(0, 2))))) hit++;
      }
      return hit;
    };
    const ranked = ([0, 1, 6] as WeekStart[]).map((ws) => ({ ws, s: score(ws) })).sort((a, b) => b.s - a.s);
    return ranked[0]!.s >= 4 && ranked[0]!.s >= ranked[1]!.s + 2 ? ranked[0]!.ws : undefined;
  };

  // A recognised month title is the strongest evidence of which month a block is.
  const titles = scene.blocks.map((b) => b.heading);
  const monthHint = titles.some(Boolean)
    ? (m: number, i: number) => {
        const t = titles[i];
        if (!t) return 0;
        if (((m % 12) + 12) % 12 + 1 !== t.month) return 5;
        if (t.year !== undefined && Math.floor(m / 12) !== t.year) return 5;
        return 0;
      }
    : undefined;

  // Colours are judged against the pixels around each cell's numeral rather than one page colour, because a
  // photograph's lighting is not even.
  const measureCell = (cell: Cell, bg: [number, number, number]): Mark => {
    const { token } = cell;
    const cx = x0 + cell.col * pitch;
    const hw = 0.46 * pitch;
    const hh = 0.46 * rowPitch;
    const xa = Math.max(0, Math.round(cx - hw));
    const xb = Math.min(img.w - 1, Math.round(cx + hw));
    const ya = Math.max(0, Math.round(token.cy - hh));
    const yb = Math.min(img.h - 1, Math.round(token.cy + hh));
    const counts: Record<Hue, number> = { red: 0, warm: 0, green: 0, cool: 0, purple: 0 };
    const dist: Record<Hue, number> = { red: 0, warm: 0, green: 0, cool: 0, purple: 0 };
    let area = 0;
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        if (x >= token.x0 - 2 && x <= token.x1 + 2 && y >= token.y0 - 2 && y <= token.y1 + 2) continue;
        area++;
        const o = (y * img.w + x) * 3;
        const r = img.rgb[o]!;
        const g = img.rgb[o + 1]!;
        const b = img.rgb[o + 2]!;
        const d = Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2]));
        if (d <= 30) continue;
        if (Math.max(r, g, b) - Math.min(r, g, b) < 28) continue;
        const hue = hueClass(r, g, b);
        counts[hue]++;
        dist[hue] += d;
      }
    }
    let hue: Hue | undefined;
    for (const h of HUES) if (counts[h] > (hue ? counts[hue] : 0)) hue = h;
    const cover = hue && area ? counts[hue] / area : 0;
    const mark: Mark = { cover, strength: hue ? dist[hue] / counts[hue] : 0 };
    if (hue && cover >= 0.006) mark.hue = hue;
    // The numeral's own colour: the pixels in its box that differ most from what the box is mostly made of.
    const bx0 = Math.max(0, token.x0), bx1 = Math.min(img.w - 1, token.x1);
    const by0 = Math.max(0, token.y0), by1 = Math.min(img.h - 1, token.y1);
    const hist = new Map<number, number>();
    for (let y = by0; y <= by1; y++) {
      for (let x = bx0; x <= bx1; x++) {
        const o = (y * img.w + x) * 3;
        const key = ((img.rgb[o]! >> 4) << 8) | ((img.rgb[o + 1]! >> 4) << 4) | (img.rgb[o + 2]! >> 4);
        hist.set(key, (hist.get(key) ?? 0) + 1);
      }
    }
    let modal = 0, best = 0;
    for (const [k, n] of hist) if (n > best) { best = n; modal = k; }
    const mr = ((modal >> 8) << 4) + 8, mg = (((modal >> 4) & 15) << 4) + 8, mb = ((modal & 15) << 4) + 8;
    // Blur and haze thin a stroke's colour, so average the farthest-from-the-box pixels, not those past a fixed gap.
    const far: { d: number; r: number; g: number; b: number }[] = [];
    let dmax = 0;
    for (let y = by0; y <= by1; y++) {
      for (let x = bx0; x <= bx1; x++) {
        const o = (y * img.w + x) * 3;
        const r = img.rgb[o]!, g = img.rgb[o + 1]!, b = img.rgb[o + 2]!;
        const d = Math.max(Math.abs(r - mr), Math.abs(g - mg), Math.abs(b - mb));
        far.push({ d, r, g, b });
        if (d > dmax) dmax = d;
      }
    }
    if (dmax >= 45) {
      let sr = 0, sg = 0, sb = 0, sn = 0;
      for (const f of far) if (f.d >= 0.65 * dmax) { sr += f.r; sg += f.g; sb += f.b; sn++; }
      if (sn >= 5) {
        const r = sr / sn, g = sg / sn, b = sb / sn;
        if (Math.max(r, g, b) - Math.min(r, g, b) >= 48) mark.glyphHue = hueClass(r, g, b);
      }
    }
    return mark;
  };

  const synthesize = (seg: Segment, slot: number): Cell | undefined => {
    const first = seg.cells[0]!;
    const col = slot % 7;
    const y = first.row.y + (Math.floor(slot / 7) - Math.floor(first.slot / 7)) * rowPitch;
    if (y - 0.4 * rowPitch < 0 || y + 0.4 * rowPitch >= img.h) return undefined;
    const cx = x0 + col * pitch;
    const row: Row = { y, cells: new Array(7).fill(undefined), count: 0 };
    const token: Token = {
      blobs: [], digits: 1, contrast: 1, cx, cy: y,
      x0: Math.round(cx - tw / 2), x1: Math.round(cx + tw / 2), y0: Math.round(y - th / 2), y1: Math.round(y + th / 2),
    };
    return { slot, token, row, col };
  };

  return interpret(
    { img, lat, segs, blank, weekStartOf, measure: measureCell, trimHeaderRow: false, synthesize, ...(monthHint ? { monthHint } : {}) },
    options,
  );
}

export { readFlat as readFlatCalendar };
