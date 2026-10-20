/**
 * Turns her raw period logs into personal cycle statistics.
 *
 * Each statistic is a recency-weighted average shrunk toward the population
 * prior, so one strange cycle (travel, illness, a missed log) moves the
 * estimate a little rather than a lot, and a brand-new user still gets a
 * sensible forecast on day one.
 */

import { addDays, compareISO, diffDays, type ISODate } from '../dates';
import { ovulationPosterior } from './ovulation';
import { POPULATION } from './population';
import type { CompletedCycle, CycleData, CycleStats, PeriodLog } from './types';

/** Logs sorted by start, with near-duplicates (starts < 10 days apart) merged as spotting. */
export function normalisePeriods(periods: PeriodLog[]): PeriodLog[] {
  const sorted = [...periods].sort((a, b) => compareISO(a.start, b.start));
  const out: PeriodLog[] = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    if (last && diffDays(last.start, p.start) < 10) {
      // Treat as a continuation of the same bleed; keep the later end if any.
      if (p.end && (!last.end || compareISO(p.end, last.end) > 0)) last.end = p.end;
      continue;
    }
    out.push({ ...p });
  }
  return out;
}

const RECENCY = 0.85;

function weightedShrink(values: number[], priorMean: number, priorWeight: number): number {
  let num = priorMean * priorWeight;
  let den = priorWeight;
  for (let i = 0; i < values.length; i++) {
    const w = RECENCY ** (values.length - 1 - i); // most recent value has weight 1
    num += w * values[i]!;
    den += w;
  }
  return num / den;
}

function weightedShrinkSd(values: number[], mean: number, priorSd: number, priorWeight: number, floor: number): number {
  let num = priorSd * priorSd * priorWeight;
  let den = priorWeight;
  for (let i = 0; i < values.length; i++) {
    const w = RECENCY ** (values.length - 1 - i);
    num += w * (values[i]! - mean) ** 2;
    den += w;
  }
  return Math.max(floor, Math.sqrt(num / den));
}

/**
 * Reconstructs completed cycles and, where sensor data allows, locates each
 * cycle's ovulation so her personal luteal length can be learned.
 */
export function completedCycles(data: CycleData): CompletedCycle[] {
  const periods = normalisePeriods(data.periods);
  const cycles: CompletedCycle[] = [];
  for (let i = 0; i + 1 < periods.length; i++) {
    const start = periods[i]!.start;
    const next = periods[i + 1]!.start;
    const length = diffDays(start, next);
    const plausible = length >= POPULATION.minPlausibleCycle && length <= POPULATION.maxPlausibleCycle;
    const cycle: CompletedCycle = { start, length, plausible };
    if (plausible) {
      const post = ovulationPosterior({
        cycleStart: start,
        // Broad priors: in a completed cycle we want the sensors, not the prior, to decide.
        priorMean: length - POPULATION.lutealMean,
        priorSd: 4,
        lutealMean: POPULATION.lutealMean,
        lutealSd: 3,
        asOf: addDays(next, -1),
        nextStart: next,
        observations: {
          lhTests: data.lhTests ?? [],
          temperatures: data.temperatures ?? [],
          mucus: data.mucus ?? [],
        },
      });
      const sensor = post.evidence.lh || post.evidence.temperature;
      let near = 0;
      for (let k = post.mode - 1; k <= post.mode + 1; k++) near += post.probs[k] ?? 0;
      if (sensor && near >= 0.7) cycle.ovulation = addDays(start, post.mode);
    }
    cycles.push(cycle);
  }
  return cycles;
}

export function estimateStats(data: CycleData): CycleStats {
  const cycles = completedCycles(data).filter((c) => c.plausible);
  const lengths = cycles.map((c) => c.length);

  const statedCycle = data.statedCycleLength;
  const cyclePrior = statedCycle && statedCycle >= 20 && statedCycle <= 45 ? statedCycle : POPULATION.cycleMean;
  // Her own stated length is worth about two cycles of evidence; the population mean, one.
  const cyclePriorWeight = statedCycle ? 2 : 1;
  const cycleMean = weightedShrink(lengths, cyclePrior, cyclePriorWeight);
  const cycleSd = weightedShrinkSd(lengths, cycleMean, POPULATION.cycleSd, 3, 1.0);

  const luteals = cycles
    .filter((c) => c.ovulation)
    .map((c) => diffDays(c.ovulation!, addDays(c.start, c.length)))
    .filter((l) => l >= 7 && l <= 18);
  const lutealMean = weightedShrink(luteals, POPULATION.lutealMean, 3);
  const lutealSd = weightedShrinkSd(luteals, lutealMean, POPULATION.lutealSd, 3, 0.9);

  const bleeds = normalisePeriods(data.periods)
    .filter((p) => p.end)
    .map((p) => diffDays(p.start, p.end!) + 1)
    .filter((l) => l >= 1 && l <= 10);
  const periodPrior = data.statedPeriodLength ?? POPULATION.periodLength;
  const periodLength = Math.round(weightedShrink(bleeds, periodPrior, 1));

  return {
    cycleMean,
    cycleSd,
    lutealMean,
    lutealSd,
    periodLength,
    cyclesObserved: lengths.length,
    ovulationsObserved: luteals.length,
  };
}
