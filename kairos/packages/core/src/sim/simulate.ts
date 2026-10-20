/**
 * Synthetic cycles with realistic variability and noisy sensors.
 *
 * Used three ways: the accuracy benchmark, the test suite, and the app's demo
 * mode (so a first-time visitor sees a living forecast without logging a thing).
 *
 * The "truth" generator deliberately differs from the likelihoods the model
 * uses, so the benchmark is not simply the model grading itself.
 */

import { addDays, diffDays, type ISODate } from '../dates';
import { clamp, POPULATION } from '../cycle/population';
import { gaussian, seededRandom } from '../random';
import type { CycleData, LHTest, MucusObservation, MucusType, TemperatureReading } from '../cycle/types';

export interface SimWoman {
  cycleMean: number;
  cycleSd: number;
  lutealMean: number;
  lutealSd: number;
  periodLength: number;
}

export interface SimCycleTruth {
  start: ISODate;
  length: number;
  ovulation: ISODate;
}

export interface SensorOptions {
  /** Daily urine LH tests from cycle day 9 until the day after the first positive. */
  lh?: boolean;
  /** Waking oral thermometer, every day. */
  bbt?: boolean;
  /** Smartwatch/ring nightly temperature deviation, every night. */
  wrist?: boolean;
  /** Cervical mucus noted on ~60% of days. */
  mucus?: boolean;
}

export interface SimOptions {
  seed: string;
  start: ISODate;
  cycles: number;
  woman?: Partial<SimWoman>;
  sensors?: SensorOptions;
  /** Stop generating observations after this date (simulate "today"). */
  observeUntil?: ISODate;
}

export interface SimResult {
  woman: SimWoman;
  truth: SimCycleTruth[];
  data: CycleData;
}

export function randomWoman(rand: () => number): SimWoman {
  return {
    cycleMean: clamp(POPULATION.cycleMean + 2.6 * gaussian(rand), 23, 37),
    cycleSd: clamp(2.4 + 1.1 * gaussian(rand), 0.8, 6),
    lutealMean: clamp(POPULATION.lutealMean + 1.3 * gaussian(rand), 9, 15.5),
    lutealSd: clamp(1.0 + 0.35 * gaussian(rand), 0.5, 2),
    periodLength: Math.round(clamp(5 + gaussian(rand), 3, 7)),
  };
}

export function simulate(opts: SimOptions): SimResult {
  const rand = seededRandom('sim', opts.seed);
  const woman: SimWoman = { ...randomWoman(rand), ...opts.woman };
  const sensors = opts.sensors ?? {};
  const until = opts.observeUntil;
  const seen = (d: ISODate) => !until || d <= until;

  const truth: SimCycleTruth[] = [];
  const data: CycleData = { periods: [], lhTests: [], temperatures: [], mucus: [] };
  let start = opts.start;

  for (let c = 0; c < opts.cycles; c++) {
    const luteal = Math.round(clamp(woman.lutealMean + woman.lutealSd * gaussian(rand), 8, 17));
    const length = Math.round(clamp(woman.cycleMean + woman.cycleSd * gaussian(rand), luteal + 9, 50));
    const ovOffset = length - luteal;
    const ovulation = addDays(start, ovOffset);
    truth.push({ start, length, ovulation });

    if (seen(start)) {
      const end = addDays(start, woman.periodLength - 1);
      data.periods.push(seen(end) ? { start, end } : { start });
    }

    for (let k = 0; k < length; k++) {
      const date = addDays(start, k);
      if (!seen(date)) break;
      const rel = k - ovOffset; // days relative to ovulation

      if (sensors.lh && k >= 8) {
        const firstPositive = data.lhTests!.find(
          (t) => t.result === 'positive' && diffDays(start, t.date) >= 0 && diffDays(t.date, date) > 0,
        );
        const stillTesting = !firstPositive || diffDays(firstPositive.date, date) <= 1;
        if (stillTesting && rel <= 3) {
          let p = 0.02;
          if (rel === -1 || rel === 0) p = 0.92;
          else if (rel === -2) p = 0.3;
          else if (rel === 1) p = 0.35;
          const result: LHTest['result'] = rand() < p ? 'positive' : 'negative';
          data.lhTests!.push({ date, result });
        }
      }

      if (sensors.bbt) {
        const rise = rel <= 0 ? 0 : rel === 1 ? 0.15 : rel === 2 ? 0.25 : 0.32;
        let t = 36.4 + rise + 0.11 * gaussian(rand);
        if (rand() < 0.04) t += 0.35; // late wake-up, a glass of wine, a cold
        if (rand() < 0.9) data.temperatures!.push({ date, celsius: round(t, 2), source: 'bbt' });
      }

      if (sensors.wrist) {
        const rise = rel <= 1 ? 0 : rel === 2 ? 0.15 : rel === 3 ? 0.25 : 0.3;
        const t = rise + 0.17 * gaussian(rand);
        if (rand() < 0.85) data.temperatures!.push({ date, celsius: round(t, 2), source: 'wrist' });
      }

      if (sensors.mucus && rand() < 0.6 && k >= woman.periodLength) {
        let type: MucusType;
        const r = rand();
        if (rel >= -4 && rel <= 0) type = r < 0.45 ? 'eggwhite' : r < 0.75 ? 'watery' : 'creamy';
        else if (rel >= -6 && rel < -4) type = r < 0.5 ? 'creamy' : r < 0.7 ? 'watery' : 'sticky';
        else type = r < 0.55 ? 'sticky' : r < 0.9 ? 'dry' : 'creamy';
        data.mucus!.push({ date, type } satisfies MucusObservation);
      }
    }
    start = addDays(start, length);
  }

  // The next period, if it falls inside the observation window.
  if (seen(start)) data.periods.push({ start });
  return { woman, truth, data };
}

function round(x: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}

/** Restrict sensor observations to a subset, e.g. to compare "calendar only" with "calendar + LH". */
export function withSensors(
  data: CycleData,
  keep: { lh?: boolean; bbt?: boolean; wrist?: boolean; mucus?: boolean },
): CycleData {
  const temps = (data.temperatures ?? []).filter(
    (t: TemperatureReading) => (t.source === 'bbt' && keep.bbt) || (t.source === 'wrist' && keep.wrist),
  );
  return {
    ...data,
    lhTests: keep.lh ? (data.lhTests ?? []) : [],
    temperatures: temps,
    mucus: keep.mucus ? (data.mucus ?? []) : [],
  };
}
