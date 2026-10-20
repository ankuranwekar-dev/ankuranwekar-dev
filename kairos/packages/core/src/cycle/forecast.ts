/**
 * The forecast: a day-by-day picture of where she is in her cycle, how sure
 * we are, and what is coming.
 *
 * Two layers:
 *  1. A *point* timeline (most likely ovulation, median next period) that
 *     gives each day one coherent season, so the UI never flickers between
 *     summer and autumn on adjacent days.
 *  2. A Monte-Carlo cloud (default 1,500 simulated futures, seeded) that gives
 *     every day honest probabilities: P(fertile), P(bleeding), P(each season).
 *     The UI draws uncertainty from these — soft edges, not hard boxes.
 */

import { addDays, diffDays, toDayNumber, fromDayNumber, type ISODate } from '../dates';
import { gaussian, sampleIndex, seededRandom } from '../random';
import { estimateStats, normalisePeriods } from './history';
import { bestWindowEnd, credibleInterval, ovulationPosterior, type Evidence, type OvulationPosterior } from './ovulation';
import { CONCEPTION_BY_OFFSET, clamp } from './population';
import { seasonOf, type Phase, type Season } from './seasons';
import type { CycleData, CycleStats } from './types';

export type Confidence = 'high' | 'medium' | 'low';

export interface DayForecast {
  date: ISODate;
  /** 1-based day of her cycle on the point timeline. */
  cycleDay: number;
  phase: Phase;
  season: Season;
  /** P(this day is in the fertile window). */
  fertile: number;
  /** Relative chance of conception from intercourse that day, 0…1 scaled to the cycle's best day. */
  conception: number;
  /** P(she is bleeding this day). */
  bleeding: number;
  /** P(each season) from the simulation. */
  seasonProbs: Record<Season, number>;
  /** Among the two most fertile days of its cycle. */
  peak: boolean;
}

export type ForecastStatus = 'ok' | 'needs-data' | 'late' | 'pregnant';

export interface Forecast {
  asOf: ISODate;
  status: ForecastStatus;
  stats: CycleStats;
  cycleStart?: ISODate;
  cycleDay?: number;
  today?: DayForecast;
  ovulation?: {
    date: ISODate;
    /** 80% credible range. */
    earliest: ISODate;
    latest: ISODate;
    confirmed: boolean;
    sd: number;
  };
  fertileWindow?: { start: ISODate; end: ISODate; best: ISODate[] };
  nextPeriod?: { date: ISODate; earliest: ISODate; latest: ISODate };
  confidence: Confidence;
  evidence: Evidence;
  days: DayForecast[];
}

export interface ForecastOptions {
  asOf: ISODate;
  /** Days of history to include before `asOf` (default 14). */
  lookback?: number;
  /** Days to forecast after `asOf` (default 70). */
  horizon?: number;
  samples?: number;
  /** Seed, so both phones compute the same future. */
  seed?: string;
}

const PREMENSTRUAL_DAYS = 5;

function phaseFor(
  day: number,
  t: { start: number; bleedEnd: number; ovulation: number; nextStart: number },
): Phase {
  if (day >= t.start && day <= t.bleedEnd) return 'menstrual';
  if (day >= t.ovulation - 5 && day <= t.ovulation + 1) return 'ovulatory';
  if (day > t.ovulation + 1) return day >= t.nextStart - PREMENSTRUAL_DAYS ? 'premenstrual' : 'luteal';
  return 'follicular';
}

interface SimCycle {
  start: number;
  bleedEnd: number;
  ovulation: number;
  nextStart: number;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const idx = clamp(Math.round(q * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[idx]!;
}

export function forecast(data: CycleData, opts: ForecastOptions): Forecast {
  const asOf = opts.asOf;
  const lookback = opts.lookback ?? 14;
  const horizon = opts.horizon ?? 70;
  const samples = opts.samples ?? 1500;
  const stats = estimateStats(data);
  const noEvidence: Evidence = { lh: false, temperature: false, mucus: false };

  const periods = normalisePeriods(data.periods).filter((p) => diffDays(p.start, asOf) >= 0);
  const current = periods[periods.length - 1];
  if (!current) {
    return { asOf, status: 'needs-data', stats, confidence: 'low', evidence: noEvidence, days: [] };
  }

  const cycleStart = current.start;
  const asOfOffset = diffDays(cycleStart, asOf);

  const positivePregnancy = (data.pregnancyTests ?? []).some(
    (t) => t.positive && diffDays(cycleStart, t.date) >= 0 && diffDays(t.date, asOf) >= 0,
  );

  // Follicular prior: cycle = follicular + luteal, so Var(F) = Var(C) − Var(L).
  const priorMean = stats.cycleMean - stats.lutealMean;
  const priorSd = Math.sqrt(Math.max(stats.cycleSd ** 2 - stats.lutealSd ** 2, 1.5 ** 2));
  const post = ovulationPosterior({
    cycleStart,
    priorMean,
    priorSd,
    lutealMean: stats.lutealMean,
    lutealSd: stats.lutealSd,
    asOf,
    observations: {
      lhTests: data.lhTests ?? [],
      temperatures: data.temperatures ?? [],
      mucus: data.mucus ?? [],
    },
  });

  // A cycle running well past anything her history makes plausible.
  const lateThreshold = stats.cycleMean + Math.max(2 * stats.cycleSd, 5);
  const status: ForecastStatus = positivePregnancy ? 'pregnant' : asOfOffset + 1 > lateThreshold ? 'late' : 'ok';

  const startDay = toDayNumber(cycleStart);
  const asOfDay = toDayNumber(asOf);
  const firstDay = Math.min(asOfDay - lookback, asOfDay);
  const lastDay = asOfDay + horizon;
  const span = lastDay - firstDay + 1;
  const loggedBleedEnd = current.end ? toDayNumber(current.end) : undefined;
  const periodLen = Math.max(1, Math.round(stats.periodLength));

  // ---- Monte Carlo -------------------------------------------------------
  const rand = seededRandom(opts.seed ?? 'kairos', cycleStart, asOf);
  const fertile = new Float64Array(span);
  const bleeding = new Float64Array(span);
  const conception = new Float64Array(span);
  const seasonCount: Record<Season, Float64Array> = {
    winter: new Float64Array(span),
    spring: new Float64Array(span),
    summer: new Float64Array(span),
    autumn: new Float64Array(span),
  };
  const nextStarts: number[] = [];

  const sampleLuteal = (minExclusive: number): number => {
    for (let i = 0; i < 24; i++) {
      const l = Math.round(stats.lutealMean + stats.lutealSd * gaussian(rand));
      if (l >= 7 && l <= 18 && l > minExclusive) return l;
    }
    return Math.max(7, minExclusive + 1);
  };

  for (let s = 0; s < samples; s++) {
    const k = sampleIndex(post.probs, rand);
    const ov = startDay + k;
    // Period hasn't come by asOf, so the luteal phase must outlast it.
    const luteal = status === 'pregnant' ? 999 : sampleLuteal(asOfDay - ov);
    const cycles: SimCycle[] = [];
    const firstBleedEnd = loggedBleedEnd ?? startDay + periodLen - 1;
    cycles.push({ start: startDay, bleedEnd: firstBleedEnd, ovulation: ov, nextStart: ov + luteal });
    nextStarts.push(ov + luteal);
    if (status !== 'pregnant') {
      while (cycles[cycles.length - 1]!.nextStart <= lastDay) {
        const start = cycles[cycles.length - 1]!.nextStart;
        const len = clamp(Math.round(stats.cycleMean + stats.cycleSd * gaussian(rand)), 18, 50);
        const l = sampleLuteal(-Infinity);
        const bleedLen = clamp(periodLen + Math.round(gaussian(rand) * 0.7), 2, 9);
        cycles.push({ start, bleedEnd: start + bleedLen - 1, ovulation: start + Math.max(6, len - l), nextStart: start + len });
      }
    }
    for (const c of cycles) {
      const from = Math.max(c.start, firstDay);
      const to = Math.min(c.nextStart - 1, lastDay);
      for (let d = from; d <= to; d++) {
        const i = d - firstDay;
        const phase = phaseFor(d, c);
        seasonCount[seasonOf(phase)][i]! += 1;
        if (phase === 'menstrual') bleeding[i]! += 1;
        const rel = d - c.ovulation;
        if (rel >= -5 && rel <= 0) {
          fertile[i]! += 1;
          conception[i]! += CONCEPTION_BY_OFFSET[rel]!;
        }
      }
    }
  }

  // ---- Point timeline ----------------------------------------------------
  nextStarts.sort((a, b) => a - b);
  const medianNext = Math.max(asOfDay + 1, quantile(nextStarts, 0.5));
  const pointCycles: SimCycle[] = [];
  const pointK = bestWindowEnd(post);
  const pointOv = startDay + pointK;
  pointCycles.push({
    start: startDay,
    bleedEnd: loggedBleedEnd ?? startDay + periodLen - 1,
    ovulation: pointOv,
    nextStart: status === 'pregnant' ? Number.POSITIVE_INFINITY : medianNext,
  });
  if (status !== 'pregnant') {
    const len = Math.round(stats.cycleMean);
    const fol = Math.max(6, Math.round(stats.cycleMean - stats.lutealMean));
    while (pointCycles[pointCycles.length - 1]!.nextStart <= lastDay) {
      const start = pointCycles[pointCycles.length - 1]!.nextStart;
      pointCycles.push({ start, bleedEnd: start + periodLen - 1, ovulation: start + fol, nextStart: start + len });
    }
  }

  // Peak days: the two highest-conception days within each point cycle.
  const peakDays = new Set<number>();
  for (const c of pointCycles) {
    const from = Math.max(c.start, firstDay);
    const to = Math.min(c.nextStart - 1, lastDay);
    const ranked: { d: number; w: number }[] = [];
    for (let d = from; d <= to; d++) ranked.push({ d, w: conception[d - firstDay]! });
    ranked.sort((a, b) => b.w - a.w);
    for (const r of ranked.slice(0, 2)) if (r.w > 0) peakDays.add(r.d);
  }

  let maxConception = 0;
  for (const c of conception) maxConception = Math.max(maxConception, c);

  const days: DayForecast[] = [];
  for (let d = firstDay; d <= lastDay; d++) {
    const i = d - firstDay;
    const c = [...pointCycles].reverse().find((pc) => d >= pc.start);
    if (!c) continue; // before this cycle started
    const phase = status === 'pregnant' && d > c.ovulation + 1 ? 'luteal' : phaseFor(d, c);
    days.push({
      date: fromDayNumber(d),
      cycleDay: d - c.start + 1,
      phase,
      season: seasonOf(phase),
      fertile: fertile[i]! / samples,
      conception: maxConception > 0 ? conception[i]! / maxConception : 0,
      bleeding: bleeding[i]! / samples,
      seasonProbs: {
        winter: seasonCount.winter[i]! / samples,
        spring: seasonCount.spring[i]! / samples,
        summer: seasonCount.summer[i]! / samples,
        autumn: seasonCount.autumn[i]! / samples,
      },
      peak: peakDays.has(d),
    });
  }

  // ---- Summary -----------------------------------------------------------
  const [lo, hi] = credibleInterval(post, 0.8);
  const fertileStart = addDays(cycleStart, pointK - 5);
  const fertileEnd = addDays(cycleStart, pointK);
  const best = days
    .filter((d) => d.peak && diffDays(fertileStart, d.date) >= 0 && diffDays(d.date, fertileEnd) >= 0)
    .map((d) => d.date);

  const confidence = confidenceOf(post, stats);
  const today = days.find((d) => d.date === asOf);

  return {
    asOf,
    status,
    stats,
    cycleStart,
    cycleDay: asOfOffset + 1,
    ...(today ? { today } : {}),
    ovulation: {
      date: addDays(cycleStart, pointK),
      earliest: addDays(cycleStart, lo),
      latest: addDays(cycleStart, hi),
      confirmed: post.confirmed,
      sd: post.sd,
    },
    fertileWindow: { start: fertileStart, end: fertileEnd, best },
    ...(status === 'pregnant'
      ? {}
      : {
          nextPeriod: {
            date: fromDayNumber(medianNext),
            earliest: fromDayNumber(Math.max(asOfDay + 1, quantile(nextStarts, 0.1))),
            latest: fromDayNumber(Math.max(asOfDay + 1, quantile(nextStarts, 0.9))),
          },
        }),
    confidence,
    evidence: post.evidence,
    days,
  };
}

function confidenceOf(post: OvulationPosterior, stats: CycleStats): Confidence {
  if (post.confirmed || post.sd <= 1.2) return 'high';
  if (post.sd <= 2.6 && stats.cyclesObserved >= 3) return 'medium';
  return 'low';
}
