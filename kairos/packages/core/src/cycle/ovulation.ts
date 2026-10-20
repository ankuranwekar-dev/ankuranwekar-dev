/**
 * Bayesian estimate of the ovulation day within one cycle.
 *
 * The posterior is a discrete distribution over "offsets" — days after the
 * first day of bleeding (offset 0 = cycle day 1). It starts from a Gaussian
 * prior built from her history and is multiplied by a likelihood for every
 * observation she has: LH tests, temperatures, cervical mucus, and the simple
 * fact that her period has not started yet.
 *
 * Every likelihood here is deliberately soft. Home tests misfire, wrist
 * temperature drifts with alcohol and illness, and people log the wrong day.
 * A model that trusts any single reading absolutely is a model that confidently
 * sends him flowers on the wrong week.
 */

import { addDays, diffDays, type ISODate } from '../dates';
import { clamp, FERTILE_OFFSETS, CONCEPTION_BY_OFFSET } from './population';
import type { LHTest, MucusObservation, MucusType, TemperatureReading } from './types';

export const MIN_OVULATION_OFFSET = 6;
export const MAX_CYCLE_LENGTH = 60;
const MIN_LUTEAL = 7;

export interface OvulationObservations {
  lhTests?: LHTest[];
  temperatures?: TemperatureReading[];
  mucus?: MucusObservation[];
}

export interface Evidence {
  lh: boolean;
  temperature: boolean;
  mucus: boolean;
}

export interface OvulationPosterior {
  cycleStart: ISODate;
  /** probs[k] = P(ovulation on cycleStart + k). Sums to 1. */
  probs: number[];
  mode: number;
  mean: number;
  sd: number;
  /** True once ovulation is very probably in the past and located to within about a day. */
  confirmed: boolean;
  /** First day of a detected sustained temperature rise, if any. */
  thermalShift?: ISODate;
  evidence: Evidence;
}

export interface PosteriorOptions {
  cycleStart: ISODate;
  /** Prior mean / SD of the ovulation offset. */
  priorMean: number;
  priorSd: number;
  /** Luteal phase distribution, used for "no period yet" and "next period was on X" conditioning. */
  lutealMean: number;
  lutealSd: number;
  /** The date we are reasoning from. Observations after it are ignored. */
  asOf: ISODate;
  /** If the cycle is complete, the day the next period began. */
  nextStart?: ISODate;
  observations?: OvulationObservations;
}

// ---------------------------------------------------------------------------
// Normal distribution helpers
// ---------------------------------------------------------------------------

/** Abramowitz–Stegun 7.1.26 erf approximation (|error| < 1.5e-7). */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

export function normalCdf(x: number, mean: number, sd: number): number {
  return 0.5 * (1 + erf((x - mean) / (sd * Math.SQRT2)));
}

/** Probability mass a Normal(mean, sd) puts on the integer bin [x − 0.5, x + 0.5). */
export function normalBin(x: number, mean: number, sd: number): number {
  return normalCdf(x + 0.5, mean, sd) - normalCdf(x - 0.5, mean, sd);
}

// ---------------------------------------------------------------------------
// Observation likelihoods
// ---------------------------------------------------------------------------

/**
 * P(urine LH test positive | ovulation is `d` days after the test).
 * The first positive urine test typically precedes ovulation by about a day
 * (one ultrasound-controlled study: 20 ± 3 h), and urinary LH can remain
 * elevated the day after ovulation. Outside the surge, kits still give
 * occasional false positives.
 */
const LH_POSITIVE_BY_GAP: Readonly<Record<number, number>> = {
  [-2]: 0.1,
  [-1]: 0.4,
  [0]: 0.8,
  [1]: 0.85,
  [2]: 0.3,
  [3]: 0.06,
};
const LH_FALSE_POSITIVE = 0.02;

export function lhLikelihood(test: LHTest, testOffset: number, ovulationOffset: number): number {
  const gap = ovulationOffset - testOffset;
  const pPos = LH_POSITIVE_BY_GAP[gap] ?? LH_FALSE_POSITIVE;
  return test.result === 'positive' ? pPos : 1 - pPos;
}

const MUCUS_RANK: Record<MucusType, number> = { dry: 0, sticky: 1, creamy: 2, watery: 3, eggwhite: 4 };

/**
 * Fertile-quality mucus (watery / egg-white) is mostly seen in the days leading
 * up to ovulation; dry or sticky mucus right before ovulation is unusual.
 */
export function mucusLikelihood(obs: MucusObservation, obsOffset: number, ovulationOffset: number): number {
  const gap = ovulationOffset - obsOffset; // >0: observation is before ovulation
  const fertile = MUCUS_RANK[obs.type] >= 3;
  const nearPeak = gap >= -1 && gap <= 5;
  const veryNear = gap >= 0 && gap <= 2;
  if (fertile) return nearPeak ? 0.75 : 0.15;
  return veryNear ? 0.3 : 0.75;
}

export interface ThermalShift {
  /** Offset of the first of three consecutive elevated readings. */
  offset: number;
  /** Mean of the six readings before the shift ("coverline" region). */
  baseline: number;
}

/**
 * Classic "three over six" rule (as used in symptothermal methods): three
 * consecutive readings each higher than the highest of the preceding six, the
 * third at least `threshold` °C above that maximum. Wrist-deviation data is
 * noisier, so callers pass a larger threshold for it.
 */
export function detectThermalShift(
  readings: { offset: number; celsius: number }[],
  threshold: number,
): ThermalShift | undefined {
  const sorted = [...readings].sort((a, b) => a.offset - b.offset);
  for (let i = 6; i + 2 < sorted.length; i++) {
    const prev = sorted.slice(i - 6, i);
    // Require the six reference readings to span no more than ~9 days (tolerate a few gaps).
    if (sorted[i - 1]!.offset - prev[0]!.offset > 9) continue;
    const ref = Math.max(...prev.map((r) => r.celsius));
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    const c = sorted[i + 2]!;
    if (c.offset - a.offset > 3) continue; // need three readings in (nearly) consecutive days
    if (a.celsius > ref && b.celsius > ref && c.celsius > ref) {
      // Standard rule: the third reading clears the coverline by `threshold`.
      // Exception rule (as in Sensiplan): if it doesn't, a fourth consecutive high reading suffices.
      const d = sorted[i + 3];
      const fourthHigh =
        d !== undefined &&
        d.offset - c.offset <= 2 &&
        d.celsius > ref &&
        (a.celsius + b.celsius + c.celsius + d.celsius) / 4 >= ref + threshold / 2;
      if (c.celsius >= ref + threshold || fourthHigh) {
        const baseline = prev.reduce((s, r) => s + r.celsius, 0) / prev.length;
        return { offset: a.offset, baseline };
      }
    }
  }
  return undefined;
}

/**
 * Temperature likelihood via a Bayesian change-point model.
 *
 * Rules like "three over six" throw away most of the data and fail on noisy
 * wearables. Instead, for every candidate ovulation day k we ask how well a
 * step model explains *all* of her readings this cycle:
 *
 *   temp(day) = baseline + Δ · ramp(day − k) + noise
 *
 * where ramp rises over the two days after ovulation (progesterone takes a day
 * or two to lift temperature). The baseline is profiled out, the shift size Δ
 * is integrated over a prior (≈0.3 °C), and the noise level is estimated from
 * her own day-to-day variation. Candidates whose step would fall after the
 * last reading reduce to the no-shift model, which is exactly the "no rise
 * yet" evidence we want.
 */
const RAMP: Record<'bbt' | 'wrist', (d: number) => number> = {
  bbt: (d) => (d <= 0 ? 0 : d === 1 ? 0.5 : 1),
  wrist: (d) => (d <= 0 ? 0 : d === 1 ? 0.3 : d === 2 ? 0.7 : 1),
};
const SHIFT_PRIOR: Record<'bbt' | 'wrist', { mean: number; sd: number }> = {
  bbt: { mean: 0.3, sd: 0.1 },
  wrist: { mean: 0.3, sd: 0.12 },
};
/** Likelihoods are tempered to stay humble about model misspecification (outliers, drift). */
const TEMPER = 0.6;

export function robustNoiseSd(values: number[]): number {
  if (values.length < 3) return 0.15;
  const diffs = values
    .slice(1)
    .map((v, i) => Math.abs(v - values[i]!))
    .sort((a, b) => a - b);
  const mad = diffs[Math.floor(diffs.length / 2)]!;
  return Math.max(0.05, (1.4826 * mad) / Math.SQRT2);
}

export function temperatureLogLikelihoods(
  readings: { offset: number; celsius: number }[],
  source: 'bbt' | 'wrist',
  n: number,
): number[] {
  const sorted = [...readings].sort((a, b) => a.offset - b.offset);
  const t = sorted.map((r) => r.celsius);
  const o = sorted.map((r) => r.offset);
  const sigma2 = robustNoiseSd(t) ** 2;
  const { mean: m, sd: tau } = SHIFT_PRIOR[source];
  const tau2 = tau * tau;
  const tMean = t.reduce((a, b) => a + b, 0) / t.length;
  let Stt = 0;
  for (const x of t) Stt += (x - tMean) ** 2;

  const out = new Array<number>(n).fill(0);
  for (let k = 0; k < n; k++) {
    const r = o.map((day) => RAMP[source](day - k));
    const rMean = r.reduce((a, b) => a + b, 0) / r.length;
    let Srr = 0;
    let Str = 0;
    for (let i = 0; i < r.length; i++) {
      Srr += (r[i]! - rMean) ** 2;
      Str += (t[i]! - tMean) * (r[i]! - rMean);
    }
    const A = Srr / sigma2 + 1 / tau2;
    const B = Str / sigma2 + m / tau2;
    out[k] = TEMPER * ((B * B) / (2 * A) - Stt / (2 * sigma2) - (m * m) / (2 * tau2) - 0.5 * Math.log(A * tau2));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Posterior
// ---------------------------------------------------------------------------

function normalise(p: number[]): number[] {
  const total = p.reduce((s, x) => s + x, 0);
  if (total <= 0 || !Number.isFinite(total)) {
    const u = 1 / p.length;
    return p.map(() => u);
  }
  return p.map((x) => x / total);
}

function moments(p: number[]): { mean: number; sd: number; mode: number } {
  let mean = 0;
  let mode = 0;
  for (let k = 0; k < p.length; k++) {
    mean += k * p[k]!;
    if (p[k]! > p[mode]!) mode = k;
  }
  let v = 0;
  for (let k = 0; k < p.length; k++) v += (k - mean) ** 2 * p[k]!;
  return { mean, sd: Math.sqrt(v), mode };
}

export function ovulationPosterior(opts: PosteriorOptions): OvulationPosterior {
  const { cycleStart, asOf, nextStart } = opts;
  const obs = opts.observations ?? {};
  const asOfOffset = diffDays(cycleStart, asOf);
  const nextOffset = nextStart ? diffDays(cycleStart, nextStart) : undefined;
  const maxOffset = Math.min(MAX_CYCLE_LENGTH - MIN_LUTEAL, (nextOffset ?? MAX_CYCLE_LENGTH) - MIN_LUTEAL + 2);
  const n = Math.max(MIN_OVULATION_OFFSET + 1, maxOffset + 1);
  const sd = Math.max(opts.priorSd, 1.0);

  // Prior.
  let p = new Array<number>(n).fill(0);
  for (let k = MIN_OVULATION_OFFSET; k < n; k++) p[k] = normalBin(k, opts.priorMean, sd);
  // Give implausible-but-possible days a small floor so strong evidence can still reach them.
  const peak = Math.max(...p);
  for (let k = MIN_OVULATION_OFFSET; k < n; k++) p[k] = Math.max(p[k]!, peak * 1e-4);

  const inWindow = (date: ISODate) => {
    const o = diffDays(cycleStart, date);
    return o >= 0 && diffDays(date, asOf) >= 0 && (nextOffset === undefined || o < nextOffset);
  };

  // Period timing.
  if (nextOffset !== undefined) {
    // Completed cycle: the next period start pins ovulation through the luteal phase.
    for (let k = 0; k < n; k++) {
      if (p[k]! > 0) p[k] = p[k]! * normalBin(nextOffset - k, opts.lutealMean, opts.lutealSd);
    }
  } else {
    // Ongoing cycle: her period has not started by `asOf`, so luteal > asOf − k.
    for (let k = 0; k < n; k++) {
      if (p[k]! <= 0) continue;
      const survive = 1 - normalCdf(asOfOffset - k + 0.5, opts.lutealMean, opts.lutealSd);
      p[k] = p[k]! * Math.max(survive, 1e-6);
    }
  }

  const evidence: Evidence = { lh: false, temperature: false, mucus: false };

  // LH tests.
  for (const t of obs.lhTests ?? []) {
    if (!inWindow(t.date)) continue;
    evidence.lh = true;
    const to = diffDays(cycleStart, t.date);
    for (let k = 0; k < n; k++) if (p[k]! > 0) p[k] = p[k]! * lhLikelihood(t, to, k);
  }

  // Temperatures — BBT and wrist are evaluated separately; they have different noise.
  let thermalShift: ISODate | undefined;
  for (const source of ['bbt', 'wrist'] as const) {
    const readings = (obs.temperatures ?? [])
      .filter((r) => r.source === source && inWindow(r.date))
      .map((r) => ({ offset: diffDays(cycleStart, r.date), celsius: r.celsius }));
    if (readings.length < 6) continue;
    evidence.temperature = true;
    const shift = detectThermalShift(readings, source === 'bbt' ? 0.2 : 0.25);
    if (shift && !thermalShift) thermalShift = addDays(cycleStart, shift.offset);
    const logL = temperatureLogLikelihoods(readings, source, n);
    const maxL = Math.max(...logL);
    for (let k = 0; k < n; k++) if (p[k]! > 0) p[k] = p[k]! * Math.exp(logL[k]! - maxL);
  }

  // Cervical mucus.
  for (const m of obs.mucus ?? []) {
    if (!inWindow(m.date)) continue;
    evidence.mucus = true;
    const mo = diffDays(cycleStart, m.date);
    for (let k = 0; k < n; k++) if (p[k]! > 0) p[k] = p[k]! * mucusLikelihood(m, mo, k);
  }

  p = normalise(p);
  const m = moments(p);

  // "Confirmed" = ovulation is behind us, tightly located, and backed by a
  // post-ovulatory signal (temperature data, or an LH positive ≥2 days ago).
  let massNearMode = 0;
  for (let k = m.mode - 1; k <= m.mode + 1; k++) massNearMode += p[k] ?? 0;
  const lhPositiveOld = (obs.lhTests ?? []).some(
    (t) => t.result === 'positive' && inWindow(t.date) && diffDays(t.date, asOf) >= 2,
  );
  const confirmed = m.mode < asOfOffset - 1 && massNearMode >= 0.75 && (evidence.temperature || lhPositiveOld);

  return {
    cycleStart,
    probs: p,
    mode: m.mode,
    mean: m.mean,
    sd: m.sd,
    confirmed,
    ...(thermalShift ? { thermalShift } : {}),
    evidence,
  };
}

/** P(day at `offset` falls inside the fertile window), from the posterior. */
export function fertileProbability(post: OvulationPosterior, offset: number): number {
  let s = 0;
  for (const rel of FERTILE_OFFSETS) s += post.probs[offset - rel] ?? 0;
  return clamp(s, 0, 1);
}

/** Relative conception weight for intercourse on day `offset` (0…0.33 scale). */
export function conceptionWeight(post: OvulationPosterior, offset: number): number {
  let s = 0;
  for (const rel of FERTILE_OFFSETS) s += (post.probs[offset - rel] ?? 0) * CONCEPTION_BY_OFFSET[rel]!;
  return s;
}

/**
 * The ovulation offset whose 6-day fertile window captures the most fertile
 * probability. With an uncertain posterior this is a better single answer than
 * the mode: it centres the displayed window on where the probability mass is.
 */
export function bestWindowEnd(post: OvulationPosterior): number {
  const n = post.probs.length;
  const fert = new Array<number>(n).fill(0);
  for (let d = 0; d < n; d++) fert[d] = fertileProbability(post, d);
  let best = post.mode;
  let bestMass = -1;
  for (let k = 5; k < n; k++) {
    let mass = 0;
    for (let j = k - 5; j <= k; j++) mass += fert[j]!;
    if (mass > bestMass + 1e-12) {
      bestMass = mass;
      best = k;
    }
  }
  return post.confirmed ? post.mode : best;
}

/** Narrowest set of consecutive offsets containing at least `mass` of the posterior. */
export function credibleInterval(post: OvulationPosterior, mass = 0.8): [number, number] {
  const p = post.probs;
  let best: [number, number] = [0, p.length - 1];
  let bestLen = Infinity;
  for (let i = 0; i < p.length; i++) {
    let s = 0;
    for (let j = i; j < p.length; j++) {
      s += p[j]!;
      if (s >= mass) {
        if (j - i < bestLen) {
          bestLen = j - i;
          best = [i, j];
        }
        break;
      }
    }
  }
  return best;
}
