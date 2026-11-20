/**
 * Finds the calendar in a photograph of a phone screen, and says how to flatten it.
 *
 * A photo of a screen is a screenshot seen through a projective transform plus glare,
 * moire and blur. The screenshot reader cannot work through that, but it does not have
 * to: the phone's own text recogniser (Apple Vision, on device) reads the day numbers
 * reliably even when the picture is crooked. A month's numbers sit on a 7-column
 * lattice, and a numeral's value says which lattice cell it occupies once the weekday of
 * the 1st is known, so every recognised numeral is a known point on a plane. Fitting a
 * homography to those points (RANSAC for the misreads, then least squares) gives the
 * transform that undoes the perspective. The flattened image goes to the ordinary
 * reader, which keeps all its checks.
 *
 * Pure TypeScript, no image decoding: the native side supplies the recognised words and
 * performs the warp this module asks for.
 */

import type { FlatBlock, FlatNumeral, FlatScene, FlatWord } from './calendar-image';

export interface OcrToken {
  text: string;
  /** Centre and size in photo pixels, origin top-left. `h` is the glyph-box height along the text direction. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0–1 */
  confidence: number;
}

export interface PhotoOcr {
  width: number;
  height: number;
  tokens: OcrToken[];
}

/** Row-major 3×3. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export interface FittedBlock {
  /** Column (0 = leftmost) of day 1. */
  first: number;
  /** Lattice row of the block's first row, in the shared lattice. Fractional: month titles sit between blocks. */
  shift: number;
  /** Day numbers matched in this block. */
  days: number[];
  /** The recognised numerals themselves, in photo pixels. */
  items: { v: number; x: number; y: number; w: number; h: number }[];
}

export interface GridFit {
  /** Lattice (column, row) to photo pixels. Column 0 is the leftmost column of the calendar. */
  h: Mat3;
  blocks: FittedBlock[];
  /** Numerals that agreed with the model, and the RMS error of those in photo pixels. */
  inliers: number;
  rms: number;
  /** Photo pixels between neighbouring columns near the middle of the grid. */
  pitch: number;
  /** Median numeral glyph-box height in the photo. */
  glyph: number;
}

// ---------------------------------------------------------------------------
// Small linear algebra
// ---------------------------------------------------------------------------

export function applyH(h: ArrayLike<number>, x: number, y: number): [number, number] {
  const w = h[6]! * x + h[7]! * y + h[8]!;
  return [(h[0]! * x + h[1]! * y + h[2]!) / w, (h[3]! * x + h[4]! * y + h[5]!) / w];
}

export function invertH(m: ArrayLike<number>): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m as unknown as number[] as [number, number, number, number, number, number, number, number, number];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

function mul(a: ArrayLike<number>, b: ArrayLike<number>): Mat3 {
  const o = new Array<number>(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c]! += a[r * 3 + k]! * b[k * 3 + c]!;
  return o as Mat3;
}

/** Gaussian elimination with partial pivoting. Returns null when singular. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    if (Math.abs(M[p]![c]!) < 1e-12) return null;
    [M[c], M[p]] = [M[p]!, M[c]!];
    for (let r = c + 1; r < n; r++) {
      const f = M[r]![c]! / M[c]![c]!;
      if (f !== 0) for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r]![n]!;
    for (let k = r + 1; k < n; k++) s -= M[r]![k]! * x[k]!;
    x[r] = s / M[r]![r]!;
  }
  return x;
}

interface Corr {
  /** lattice */
  a: number;
  b: number;
  /** photo */
  u: number;
  v: number;
}

/** Normalised direct linear transform, least squares over any number (≥4) of correspondences. */
export function fitHomography(pts: Corr[]): Mat3 | null {
  const n = pts.length;
  if (n < 4) return null;
  let lmx = 0, lmy = 0, pmx = 0, pmy = 0;
  for (const p of pts) { lmx += p.a; lmy += p.b; pmx += p.u; pmy += p.v; }
  lmx /= n; lmy /= n; pmx /= n; pmy /= n;
  let ls = 0, ps = 0;
  for (const p of pts) { ls += Math.hypot(p.a - lmx, p.b - lmy); ps += Math.hypot(p.u - pmx, p.v - pmy); }
  const lk = Math.SQRT2 / (ls / n || 1);
  const pk = Math.SQRT2 / (ps / n || 1);

  // Normal equations of the 2n × 8 system, accumulated without allocating.
  const AtA = new Float64Array(64);
  const Atb = new Float64Array(8);
  const r = new Float64Array(8);
  const add = (rhs: number) => {
    for (let i = 0; i < 8; i++) {
      const ri = r[i]!;
      if (ri === 0) continue;
      Atb[i]! += ri * rhs;
      for (let j = 0; j < 8; j++) AtA[i * 8 + j]! += ri * r[j]!;
    }
  };
  for (const p of pts) {
    const x = (p.a - lmx) * lk, y = (p.b - lmy) * lk;
    const u = (p.u - pmx) * pk, v = (p.v - pmy) * pk;
    r[0] = x; r[1] = y; r[2] = 1; r[3] = 0; r[4] = 0; r[5] = 0; r[6] = -u * x; r[7] = -u * y;
    add(u);
    r[0] = 0; r[1] = 0; r[2] = 0; r[3] = x; r[4] = y; r[5] = 1; r[6] = -v * x; r[7] = -v * y;
    add(v);
  }
  // Gaussian elimination with partial pivoting, in place.
  for (let c = 0; c < 8; c++) {
    let piv = c;
    for (let q = c + 1; q < 8; q++) if (Math.abs(AtA[q * 8 + c]!) > Math.abs(AtA[piv * 8 + c]!)) piv = q;
    if (Math.abs(AtA[piv * 8 + c]!) < 1e-12) return null;
    if (piv !== c) {
      for (let j = 0; j < 8; j++) { const t = AtA[c * 8 + j]!; AtA[c * 8 + j] = AtA[piv * 8 + j]!; AtA[piv * 8 + j] = t; }
      const t = Atb[c]!; Atb[c] = Atb[piv]!; Atb[piv] = t;
    }
    for (let q = c + 1; q < 8; q++) {
      const f = AtA[q * 8 + c]! / AtA[c * 8 + c]!;
      if (f === 0) continue;
      for (let j = c; j < 8; j++) AtA[q * 8 + j]! -= f * AtA[c * 8 + j]!;
      Atb[q]! -= f * Atb[c]!;
    }
  }
  const h = new Float64Array(8);
  for (let i = 7; i >= 0; i--) {
    let t = Atb[i]!;
    for (let j = i + 1; j < 8; j++) t -= AtA[i * 8 + j]! * h[j]!;
    h[i] = t / AtA[i * 8 + i]!;
  }
  const Hn: Mat3 = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!, 1];
  const Tl: Mat3 = [lk, 0, -lmx * lk, 0, lk, -lmy * lk, 0, 0, 1];
  const Tp: Mat3 = [1 / pk, 0, pmx, 0, 1 / pk, pmy, 0, 0, 1];
  const H = mul(Tp, mul(Hn, Tl));
  const sc = H[8];
  return (sc !== 0 ? H.map((x) => x / sc) : H) as Mat3;
}

// ---------------------------------------------------------------------------
// Day numerals
// ---------------------------------------------------------------------------

interface Numeral {
  v: number;
  x: number;
  y: number;
  w: number;
  h: number;
  conf: number;
}

/** Recognised words that could be a day of the month. Punctuation the recogniser glues on is ignored. */
export function numerals(ocr: PhotoOcr): Numeral[] {
  const out: Numeral[] = [];
  for (const t of ocr.tokens) {
    if (t.confidence < 0.3) continue;
    const digits = t.text.replace(/[^0-9]/g, '');
    if (digits.length < 1 || digits.length > 2 || t.text.length > digits.length + 1) continue;
    if (/[A-Za-z]/.test(t.text)) continue; // 5G, 3rd
    const v = Number(digits);
    if (v < 1 || v > 31 || (digits.length === 2 && digits[0] === '0')) continue;
    out.push({ v, x: t.x, y: t.y, w: t.w, h: t.h, conf: t.confidence });
  }
  const hs = out.map((n) => n.h).sort((a, b) => a - b);
  if (hs.length < 8) return out;
  const med = hs[hs.length >> 1]!;
  return out.filter((n) => n.h > 0.55 * med && n.h < 1.7 * med);
}

/** Lattice cell of day `v` in a month whose 1st sits in column `first`. */
function cell(v: number, first: number): [number, number] {
  const k = v - 1 + first;
  return [k % 7, Math.floor(k / 7)];
}

// A tiny deterministic generator keeps every run of the fit identical.
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function pitchOf(h: Mat3, cx: number, cy: number): number {
  const [x0, y0] = applyH(h, cx, cy);
  const [x1, y1] = applyH(h, cx + 1, cy);
  return Math.hypot(x1 - x0, y1 - y0);
}

// ---------------------------------------------------------------------------
// The fit
// ---------------------------------------------------------------------------

/**
 * Fit the lattice. Returns null when no month's worth of numerals lines up.
 */
export function fitPhotoGrid(ocr: PhotoOcr): GridFit | null {
  const nums = numerals(ocr);
  if (nums.length < 8) return null;
  const glyph = [...nums].map((n) => n.h).sort((a, b) => a - b)[nums.length >> 1]!;
  const rand = rng(12345);

  // 1. The best single month block: RANSAC over (column of day 1, four numerals). Samples are mostly drawn from
  // numerals that sit near each other, because those are likely to be from one month and so all fit one lattice.
  const near = nums.map((n, i) =>
    nums
      .map((m, j) => ({ j, d: Math.hypot(m.x - n.x, m.y - n.y) }))
      .filter((e) => e.j !== i)
      .sort((p, q) => p.d - q.d)
      .slice(0, 10)
      .map((e) => e.j),
  );
  let best: { h: Mat3; first: number; inl: number[]; score: number } | null = null;
  const ITER = 260;
  search: for (let first = 0; first < 7; first++) {
    for (let it = 0; it < ITER; it++) {
      const idx: number[] = [Math.floor(rand() * nums.length)];
      const local = rand() < 0.65;
      let guard = 0;
      while (idx.length < 4 && guard++ < 40) {
        const k = local ? near[idx[0]!]![Math.floor(rand() * near[idx[0]!]!.length)]! : Math.floor(rand() * nums.length);
        if (!idx.includes(k)) idx.push(k);
      }
      if (idx.length < 4) continue;
      const sample = idx.map((k) => nums[k]!);
      if (new Set(sample.map((q) => q.v)).size < 4) continue;
      const pts = sample.map((q) => {
        const [a, b] = cell(q.v, first);
        return { a, b, u: q.x, v: q.y };
      });
      // Reject near-collinear lattice samples.
      if (collinear(pts.map((q) => [q.a, q.b]))) continue;
      const h = fitHomography(pts);
      if (!h || !sane(h, glyph, ocr)) continue;
      const sc = scoreOf(nums, h, first, 0.30);
      if (sc > (best?.score ?? 0)) {
        best = { h, first, inl: [], score: sc };
        // Nearly every numeral agrees with this one lattice: nothing can beat it.
        if (sc >= 0.85 * nums.length) break search;
      }
    }
  }
  if (best) best.inl = inliers(nums, best.h, best.first, 0.30).idx;
  if (!best || best.inl.length < 8) return null;

  // 2. Refine on the inliers, tightening the gate.
  let h = best.h;
  let first = best.first;
  let inl = best.inl;
  for (const gate of [0.22, 0.16, 0.12]) {
    const pts = inl.map((k) => {
      const [a, b] = cell(nums[k]!.v, first);
      return { a, b, u: nums[k]!.x, v: nums[k]!.y };
    });
    const hh = fitHomography(pts);
    if (!hh || !sane(hh, glyph, ocr)) break;
    h = hh;
    inl = inliers(nums, h, first, gate).idx;
  }
  if (inl.length < 8) return null;

  // 3. Other month blocks share the same lattice up to a vertical shift (a month title sits between).
  const used = new Set(inl);
  const blocks: FittedBlock[] = [{ first, shift: 0, days: inl.map((k) => nums[k]!.v), items: inl.map((k) => nums[k]!) }];
  const members: { k: number; first: number; shift: number }[] = inl.map((k) => ({ k, first, shift: 0 }));
  const hInv = invertH(h);
  for (let round = 0; round < 6; round++) {
    const rest = nums.map((n, k) => ({ n, k })).filter(({ k }) => !used.has(k));
    if (rest.length < 3) break;
    // Where each leftover numeral falls in the lattice.
    const lat = rest.map(({ n, k }) => ({ k, v: n.v, p: applyH(hInv, n.x, n.y) }));
    let top: { first: number; shift: number; ks: number[] } | null = null;
    for (let f = 0; f < 7; f++) {
      const gs: { g: number; k: number }[] = [];
      for (const t of lat) {
        const [c, r] = cell(t.v, f);
        if (Math.abs(t.p[0] - c) < 0.3) gs.push({ g: t.p[1] - r, k: t.k });
      }
      gs.sort((a, b) => a.g - b.g);
      // The densest window of shifts 0.3 wide.
      let lo = 0;
      for (let hi = 0; hi < gs.length; hi++) {
        while (gs[hi]!.g - gs[lo]!.g > 0.3) lo++;
        const count = hi - lo + 1;
        if (count > (top?.ks.length ?? 0)) {
          const win = gs.slice(lo, hi + 1);
          top = { first: f, shift: win.reduce((s, w) => s + w.g, 0) / win.length, ks: win.map((w) => w.k) };
        }
      }
    }
    if (!top || top.ks.length < 5) break;
    // Distinct days only, and not the same value twice.
    const seen = new Set<number>();
    const ks = top.ks.filter((k) => (seen.has(nums[k]!.v) ? false : (seen.add(nums[k]!.v), true)));
    if (ks.length < 5) break;
    for (const k of ks) { used.add(k); members.push({ k, first: top.first, shift: top.shift }); }
    blocks.push({ first: top.first, shift: top.shift, days: ks.map((k) => nums[k]!.v), items: ks.map((k) => nums[k]!) });
  }

  // 4. Joint least squares over every block: one lattice, a vertical shift per block.
  const refined = refine(nums, members, blocks, h);
  h = refined.h;
  const oldShift = blocks.map((b) => b.shift);
  for (let i = 0; i < blocks.length; i++) blocks[i]!.shift = refined.shifts[i]!;

  for (const m of members) {
    const bi = blocks.findIndex((b, i) => b.first === m.first && Math.abs(oldShift[i]! - m.shift) < 1e-9);
    if (bi >= 0) m.shift = blocks[bi]!.shift;
  }
  // Greyed days of the neighbouring months sit in the same rows as the month they surround. They fit a lattice of
  // their own, but they are not months: drop small blocks that share a row with a larger one.
  const rowsOf = (b: FittedBlock) => b.items.map((it) => cell(it.v, b.first)[1] + b.shift);
  const keep = blocks.map((b, i) => {
    if (b.items.length > 8) return true;
    const mine = rowsOf(b);
    // A bigger block's rows, plus the row its 1st falls on even when that numeral was not read: greyed days of the
    // previous month sit there.
    return !blocks.some(
      (o, j) =>
        j !== i &&
        o.items.length > b.items.length &&
        [...rowsOf(o), o.shift].some((r) => mine.some((q) => Math.abs(q - r) < 0.35)),
    );
  });
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (keep[i]) continue;
    for (let k = members.length - 1; k >= 0; k--) if (members[k]!.first === blocks[i]!.first && Math.abs(members[k]!.shift - blocks[i]!.shift) < 1e-6) members.splice(k, 1);
    blocks.splice(i, 1);
  }

  let se = 0;
  let n = 0;
  const res = residuals(nums, members, blocks, h);
  for (const r of res) { se += r * r; n++; }
  const pitch = pitchOf(h, 3, 2);
  return { h, blocks, inliers: members.length, rms: Math.sqrt(se / Math.max(1, n)), pitch, glyph };
}

function collinear(p: number[][]): boolean {
  // The four lattice samples must not all lie in one row or column or on one line.
  const rows = new Set(p.map((q) => q[1]));
  const cols = new Set(p.map((q) => q[0]));
  if (rows.size < 2 || cols.size < 2) return true;
  for (let i = 0; i < 4; i++) {
    let line = true;
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      if (a === i || b === i) continue;
      const q = [0, 1, 2, 3].filter((k) => k !== i);
      const [A, B, C] = q.map((k) => p[k]!) as [number[], number[], number[]];
      const cr = (B[0]! - A[0]!) * (C[1]! - A[1]!) - (B[1]! - A[1]!) * (C[0]! - A[0]!);
      if (Math.abs(cr) > 1e-9) line = false;
    }
    if (line) return true;
  }
  return false;
}

/** A plausible lattice: cells a few glyphs wide, not mirrored, no point at infinity near the grid. */
function sane(h: Mat3, glyph: number, ocr: PhotoOcr): boolean {
  for (const [cx, cy] of [[0, 0], [6, 0], [0, 5], [6, 5], [3, 2.5]] as const) {
    const w = h[6] * cx + h[7] * cy + h[8];
    if (!(w > 0)) return false;
  }
  const p = pitchOf(h, 3, 2.5);
  if (!(p > 0.9 * glyph && p < 9 * glyph)) return false;
  const [x0, y0] = applyH(h, 0, 0), [x1, y1] = applyH(h, 1, 0), [x2, y2] = applyH(h, 0, 1);
  const area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
  if (!(area > 0)) return false; // x to the right, y down: positive orientation in image space
  const rowP = Math.hypot(x2 - x0, y2 - y0);
  if (!(rowP > 0.7 * glyph && rowP < 12 * glyph)) return false;
  // Not wildly foreshortened: neighbouring cells within a factor of 2.2 along both axes.
  const far = pitchOf(h, 3, 8), near = pitchOf(h, 3, -2);
  if (!(far > 0 && near > 0) || Math.max(far, near) / Math.min(far, near) > 3.2) return false;
  void ocr;
  return true;
}

const bestDist = new Float64Array(32);

/** The score `inliers` would give, without building the list: this is the inner loop of the search. */
function scoreOf(nums: Numeral[], h: Mat3, first: number, gate: number): number {
  const w0 = h[6] * 3 + h[7] * 2.5 + h[8];
  const w1 = h[6] * 4 + h[7] * 2.5 + h[8];
  const tau = gate * Math.hypot((h[0] * 4 + h[1] * 2.5 + h[2]) / w1 - (h[0] * 3 + h[1] * 2.5 + h[2]) / w0, (h[3] * 4 + h[4] * 2.5 + h[5]) / w1 - (h[3] * 3 + h[4] * 2.5 + h[5]) / w0);
  bestDist.fill(Infinity);
  for (let k = 0; k < nums.length; k++) {
    const n = nums[k]!;
    const c = n.v - 1 + first;
    const a = c % 7, b = (c - a) / 7;
    const w = h[6] * a + h[7] * b + h[8];
    const dx = (h[0] * a + h[1] * b + h[2]) / w - n.x;
    const dy = (h[3] * a + h[4] * b + h[5]) / w - n.y;
    const d = Math.hypot(dx, dy);
    if (d < tau && d < bestDist[n.v]!) bestDist[n.v] = d;
  }
  let score = 0;
  for (let v = 1; v <= 31; v++) if (bestDist[v]! < tau) score += 1 - (bestDist[v]! / tau) ** 2 * 0.5;
  return score;
}

function inliers(nums: Numeral[], h: Mat3, first: number, gate: number): { idx: number[]; score: number } {
  const p = pitchOf(h, 3, 2.5);
  const tau = gate * p;
  const bestFor = new Map<number, { k: number; d: number }>();
  for (let k = 0; k < nums.length; k++) {
    const n = nums[k]!;
    const [a, b] = cell(n.v, first);
    const [x, y] = applyH(h, a, b);
    const d = Math.hypot(x - n.x, y - n.y);
    if (d < tau) {
      const prev = bestFor.get(n.v);
      if (!prev || d < prev.d) bestFor.set(n.v, { k, d });
    }
  }
  const idx = [...bestFor.values()].map((v) => v.k);
  let score = 0;
  for (const { d } of bestFor.values()) score += 1 - (d / tau) ** 2 * 0.5;
  return { idx, score };
}

function residuals(nums: Numeral[], members: { k: number; first: number; shift: number }[], blocks: FittedBlock[], h: Mat3): number[] {
  void blocks;
  return members.map((m) => {
    const [a, b] = cell(nums[m.k]!.v, m.first);
    const [x, y] = applyH(h, a, b + m.shift);
    return Math.hypot(x - nums[m.k]!.x, y - nums[m.k]!.y);
  });
}

/** Levenberg–Marquardt on the lattice homography (8) and one vertical shift per block after the first. */
function refine(nums: Numeral[], members: { k: number; first: number; shift: number }[], blocks: FittedBlock[], h0: Mat3) {
  const nb = blocks.length;
  const key = (m: { first: number; shift: number }) => blocks.findIndex((b) => b.first === m.first && Math.abs(b.shift - m.shift) < 1e-9);
  const blockOf = members.map((m) => key(m));
  const theta = [h0[0] / h0[8], h0[1] / h0[8], h0[2] / h0[8], h0[3] / h0[8], h0[4] / h0[8], h0[5] / h0[8], h0[6] / h0[8], h0[7] / h0[8]];
  for (let i = 1; i < nb; i++) theta.push(blocks[i]!.shift);
  const np = theta.length;
  const H = (t: number[]): Mat3 => [t[0]!, t[1]!, t[2]!, t[3]!, t[4]!, t[5]!, t[6]!, t[7]!, 1];
  const resid = (t: number[]) => {
    const hh = H(t);
    const r: number[] = [];
    for (let i = 0; i < members.length; i++) {
      const m = members[i]!;
      const bi = blockOf[i]!;
      const sh = bi === 0 ? 0 : t[7 + bi]!;
      const [a, b] = cell(nums[m.k]!.v, m.first);
      const [x, y] = applyH(hh, a, b + sh);
      r.push(x - nums[m.k]!.x, y - nums[m.k]!.y);
    }
    return r;
  };
  let lambda = 1e-3;
  let r = resid(theta);
  let cost = r.reduce((s, x) => s + x * x, 0);
  for (let it = 0; it < 25; it++) {
    const J: number[][] = [];
    for (let j = 0; j < np; j++) {
      const t2 = theta.slice();
      const e = Math.max(1e-6, Math.abs(theta[j]!) * 1e-6);
      t2[j]! += e;
      const r2 = resid(t2);
      J.push(r2.map((v, i) => (v - r[i]!) / e));
    }
    const A: number[][] = Array.from({ length: np }, () => new Array<number>(np).fill(0));
    const g = new Array<number>(np).fill(0);
    for (let i = 0; i < np; i++) {
      for (let j = 0; j < np; j++) { let s = 0; for (let k = 0; k < r.length; k++) s += J[i]![k]! * J[j]![k]!; A[i]![j] = s; }
      let s = 0; for (let k = 0; k < r.length; k++) s += J[i]![k]! * r[k]!; g[i] = -s;
    }
    let improved = false;
    for (let tries = 0; tries < 6; tries++) {
      const Ad = A.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) + 1e-9 : v)));
      const d = solve(Ad, g);
      if (!d) { lambda *= 10; continue; }
      const t2 = theta.map((v, i) => v + d[i]!);
      const r2 = resid(t2);
      const c2 = r2.reduce((s, x) => s + x * x, 0);
      if (Number.isFinite(c2) && c2 < cost) {
        for (let i = 0; i < np; i++) theta[i] = t2[i]!;
        r = r2; cost = c2; lambda = Math.max(1e-9, lambda / 3); improved = true; break;
      }
      lambda *= 8;
    }
    if (!improved) break;
  }
  const shifts = [0, ...theta.slice(8)];
  return { h: H(theta), shifts };
}

// ---------------------------------------------------------------------------
// Flattening
// ---------------------------------------------------------------------------

export interface RectifyPlan {
  /** Output pixel to photo pixel. */
  homography: Mat3;
  width: number;
  height: number;
  /** Where the lattice sits in the flattened image: lattice (a, b) is at pixel ((a − x0) · cell, (b − y0) · cell · aspect). */
  x0: number;
  y0: number;
  cell: number;
  aspect: number;
  /** True when the edge of the photo cuts through the calendar's columns, so some days cannot be seen. */
  cropped: boolean;
}

/** Columns are drawn this many pixels apart, like a phone screenshot at the reader's working width. */
const CELL = 96.5;

/**
 * Where the lattice's rows are, relative to its columns, in the real world, from the camera's geometry.
 * The photo's focal length is unknown; a typical phone's main camera is about 0.75 of the long edge.
 */
function rowAspect(h: Mat3, width: number, height: number): number {
  const edge = Math.max(width, height);
  const cx = width / 2, cy = height / 2;
  const at = (f: number) => {
    // K^-1 applied to the images of the lattice's x and y directions (columns 1 and 2 of h).
    const a = [(h[0] - cx * h[6]) / f, (h[3] - cy * h[6]) / f, h[6]];
    const b = [(h[1] - cx * h[7]) / f, (h[4] - cy * h[7]) / f, h[7]];
    const na = Math.hypot(a[0]!, a[1]!, a[2]!), nb = Math.hypot(b[0]!, b[1]!, b[2]!);
    const cos = (a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) / (na * nb);
    return { ratio: nb / na, cos };
  };
  let bestF = 0.75 * edge;
  let best = Math.abs(at(bestF).cos);
  for (let k = 0.45; k <= 1.2; k += 0.025) {
    const c = Math.abs(at(k * edge).cos);
    if (c < best - 0.01) { best = c; bestF = k * edge; }
  }
  const r = at(bestF).ratio;
  return Number.isFinite(r) ? Math.min(1.8, Math.max(0.6, r)) : 1;
}

/**
 * The window of the lattice to flatten: the full width of the columns, from the weekday header (when it was read) to just
 * under the last row, trimmed to what the photo actually contains.
 */
export function planRectify(fit: GridFit, ocr: PhotoOcr): RectifyPlan {
  const inv = invertH(fit.h);
  const rows = fit.blocks.flatMap((b) => b.days.map((d) => cell(d, b.first)[1] + b.shift));
  const rmin = Math.min(...rows), rmax = Math.max(...rows);

  // The weekday header: single letters sitting on column centres just above the first row.
  let top = rmin - 1.4;
  const heads: number[] = [];
  for (const t of ocr.tokens) {
    if (!/^[SMTWF]$/i.test(t.text.trim())) continue;
    const [a, b] = applyH(inv, t.x, t.y);
    if (b < rmin + 0.2 && b > rmin - 3.2 && Math.abs(a - Math.round(a)) < 0.3 && a > -0.5 && a < 6.5) heads.push(b);
  }
  if (heads.length >= 3) heads.sort((p, q) => p - q), (top = heads[heads.length >> 1]! - 0.75);
  let bottom = rmax + 0.9;

  const x0 = -0.73, x1 = 6.73;
  // Trim the window's top and bottom until its corners are inside the photo vertically. Sideways overflow is a different
  // problem (the photo cuts through the columns) and is reported, not trimmed.
  const above = (a: number, b: number) => {
    const [, y] = applyH(fit.h, a, b);
    return y >= 4 && y <= ocr.height - 4;
  };
  while (top < rmin - 0.2 && !(above(x0, top) && above(x1, top))) top += 0.1;
  while (bottom > rmax + 0.2 && !(above(x0, bottom) && above(x1, bottom))) bottom -= 0.1;

  const aspect = rowAspect(fit.h, ocr.width, ocr.height);
  const width = Math.round((x1 - x0) * CELL);
  const height = Math.round((bottom - top) * CELL * aspect);
  // output px -> lattice -> photo
  const toLattice: Mat3 = [1 / CELL, 0, x0, 0, 1 / (CELL * aspect), top, 0, 0, 1];
  // Outside by more than a quarter of a column on either side means days were cut off.
  const slack = (a: number, b: number) => {
    const [x, y] = applyH(fit.h, a, b);
    return Math.max(-x, x - ocr.width, -y, y - ocr.height);
  };
  const cropped = [x0, x1].some((a) => [top, bottom].some((b) => slack(a, b) > 0.25 * fit.pitch));
  return { homography: mul(fit.h, toLattice), width, height, x0, y0: top, cell: CELL, aspect, cropped };
}

// ---------------------------------------------------------------------------
// The scene for the reader
// ---------------------------------------------------------------------------

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "August", "Aug", "Sept." and the like: the month number (1–12), or 0. */
export function monthWord(text: string): number {
  const t = text.toLowerCase().replace(/[.,:]/g, '');
  if (t.length < 3 || !/^[a-z]+$/.test(t)) return 0;
  const i = MONTHS.indexOf(t.slice(0, 3));
  if (i < 0) return 0;
  const full = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'][i]!;
  return full.startsWith(t) || (t === 'sept' && i === 8) ? i + 1 : 0;
}

/**
 * The recognised text and the fitted grid, expressed in the flattened image's pixels.
 */
export function buildScene(ocr: PhotoOcr, fit: GridFit, plan: RectifyPlan): FlatScene {
  const toFlat = invertH(plan.homography);
  const rowPx = plan.cell * plan.aspect;
  const scaleAt = (x: number, y: number): [number, number] => {
    const [a, b] = applyH(toFlat, x, y);
    const [c, d] = applyH(toFlat, x + 1, y);
    const [e, f] = applyH(toFlat, x, y + 1);
    return [Math.hypot(c - a, d - b), Math.hypot(e - a, f - b)];
  };
  const inv = invertH(fit.h);

  const blocks: FlatBlock[] = fit.blocks
    .map((b) => {
      const numerals: FlatNumeral[] = b.items.map((it) => {
        const [col, row] = cell(it.v, b.first);
        const [sx, sy] = scaleAt(it.x, it.y);
        return {
          value: it.v,
          x: (col - plan.x0) * plan.cell,
          y: (row + b.shift - plan.y0) * rowPx,
          w: it.w * sx,
          h: it.h * sy,
          col,
          row,
        };
      });
      return { first: b.first, numerals, top: Math.min(...numerals.map((n) => n.row)) + b.shift } as FlatBlock & { top: number };
    })
    .sort((p, q) => (p as any).top - (q as any).top);

  // Month titles: a month name, optionally followed by a year, a little above a block's first row.
  const months = ocr.tokens
    .map((t) => ({ t, m: monthWord(t.text) }))
    .filter((x) => x.m > 0)
    .map((x) => ({ ...x, lat: applyH(inv, x.t.x, x.t.y) }));
  const years = ocr.tokens.filter((t) => /^(19|20)\d\d$/.test(t.text.trim())).map((t) => ({ t, lat: applyH(inv, t.x, t.y), y: Number(t.text) }));
  const claimed = new Set<number>();
  for (const blk of blocks as (FlatBlock & { top: number })[]) {
    let best: { i: number; gap: number } | null = null;
    months.forEach((m, i) => {
      if (claimed.has(i)) return;
      const gap = blk.top - m.lat[1];
      if (gap > 0.25 && gap < 3 && m.lat[0] > -1.5 && m.lat[0] < 7.5 && (!best || gap < best.gap)) best = { i, gap };
    });
    if (!best) continue;
    const found = months[(best as { i: number }).i]!;
    claimed.add((best as { i: number }).i);
    const yr = years.find((y) => Math.abs(y.lat[1] - found.lat[1]) < 0.4 && y.lat[0] > found.lat[0] && y.lat[0] - found.lat[0] < 3.2);
    blk.heading = { month: found.m, ...(yr ? { year: yr.y } : {}) };
  }

  const words: FlatWord[] = ocr.tokens.map((t) => {
    const [x, y] = applyH(toFlat, t.x, t.y);
    const [sx, sy] = scaleAt(t.x, t.y);
    return { text: t.text, x, y, w: t.w * sx, h: t.h * sy };
  });
  return {
    pitch: plan.cell,
    x0: -plan.x0 * plan.cell,
    rowPitch: rowPx,
    blocks: blocks.map(({ first, numerals, heading }) => ({ first, numerals, ...(heading ? { heading } : {}) })),
    words,
  };
}
