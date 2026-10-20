import { describe, expect, it } from 'vitest';
import { addDays, diffDays } from '../src/dates';
import { completedCycles, estimateStats, normalisePeriods } from '../src/cycle/history';
import { detectThermalShift, fertileProbability, ovulationPosterior } from '../src/cycle/ovulation';
import { forecast } from '../src/cycle/forecast';
import { POPULATION } from '../src/cycle/population';
import { simulate } from '../src/sim/simulate';
import type { CycleData } from '../src/cycle/types';

const regular = (start: string, n: number, len: number): CycleData => ({
  periods: Array.from({ length: n }, (_, i) => ({ start: addDays(start, i * len), end: addDays(start, i * len + 4) })),
});

describe('history', () => {
  it('merges period logs that are really one bleed', () => {
    const p = normalisePeriods([
      { start: '2026-01-01' },
      { start: '2026-01-04', end: '2026-01-06' },
      { start: '2026-01-29' },
    ]);
    expect(p).toEqual([{ start: '2026-01-01', end: '2026-01-06' }, { start: '2026-01-29' }]);
  });

  it('flags implausible cycles (missed logs) and ignores them', () => {
    const data: CycleData = { periods: [{ start: '2026-01-01' }, { start: '2026-01-29' }, { start: '2026-04-20' }] };
    const cycles = completedCycles(data);
    expect(cycles.map((c) => c.plausible)).toEqual([true, false]);
    expect(estimateStats(data).cyclesObserved).toBe(1);
  });

  it('shrinks toward the population when history is short, and toward her when it is long', () => {
    const short = estimateStats(regular('2026-01-01', 2, 26));
    const long = estimateStats(regular('2025-01-01', 13, 26));
    expect(short.cycleMean).toBeGreaterThan(26);
    expect(short.cycleMean).toBeLessThan(POPULATION.cycleMean);
    expect(Math.abs(long.cycleMean - 26)).toBeLessThan(Math.abs(short.cycleMean - 26));
    expect(long.cycleSd).toBeLessThan(short.cycleSd + 1e-9);
  });

  it('respects what she says her cycle length is before data exists', () => {
    const s = estimateStats({ periods: [{ start: '2026-01-01' }], statedCycleLength: 33 });
    expect(s.cycleMean).toBeCloseTo(33, 5);
  });

  it('learns her luteal length from cycles with temperature data', () => {
    const sim = simulate({
      seed: 'luteal',
      start: '2025-01-03',
      cycles: 8,
      woman: { cycleMean: 30, cycleSd: 1.5, lutealMean: 10, lutealSd: 0.6, periodLength: 5 },
      sensors: { bbt: true },
    });
    const s = estimateStats(sim.data);
    expect(s.ovulationsObserved).toBeGreaterThanOrEqual(5);
    expect(s.lutealMean).toBeLessThan(11.6); // pulled from 12.4 toward her true 10
  });
});

describe('ovulation posterior', () => {
  const base = { cycleStart: '2026-10-01', priorMean: 15, priorSd: 3, lutealMean: 12.4, lutealSd: 1.8 };

  it('is a proper distribution', () => {
    const p = ovulationPosterior({ ...base, asOf: '2026-10-05' });
    expect(p.probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(p.probs.every((x) => x >= 0)).toBe(true);
    expect(Math.abs(p.mean - 15)).toBeLessThan(1);
  });

  it('moves to the day after a positive LH test, even against the prior', () => {
    const p = ovulationPosterior({
      ...base,
      asOf: '2026-10-21',
      observations: {
        lhTests: [
          ...Array.from({ length: 9 }, (_, i) => ({ date: addDays('2026-10-09', i), result: 'negative' as const })),
          { date: '2026-10-18', result: 'positive' },
        ],
      },
    });
    const ovDate = addDays(base.cycleStart, p.mode);
    expect(diffDays('2026-10-18', ovDate)).toBeGreaterThanOrEqual(0);
    expect(diffDays('2026-10-18', ovDate)).toBeLessThanOrEqual(1);
    expect(p.confirmed).toBe(true);
    expect(p.sd).toBeLessThan(1.2);
  });

  it('negative LH tests push probability later', () => {
    const before = ovulationPosterior({ ...base, asOf: '2026-10-15' });
    const after = ovulationPosterior({
      ...base,
      asOf: '2026-10-15',
      observations: {
        lhTests: Array.from({ length: 7 }, (_, i) => ({ date: addDays('2026-10-09', i), result: 'negative' as const })),
      },
    });
    expect(after.mean).toBeGreaterThan(before.mean + 1);
  });

  it('detects a classic three-over-six temperature shift', () => {
    const temps = [36.4, 36.35, 36.45, 36.4, 36.3, 36.42, 36.38, 36.62, 36.7, 36.72, 36.75].map((c, i) => ({
      offset: 8 + i,
      celsius: c,
    }));
    const shift = detectThermalShift(temps, 0.2);
    expect(shift?.offset).toBe(15);
  });

  it('does not call a single feverish morning a shift', () => {
    const temps = [36.4, 36.35, 36.45, 36.4, 36.3, 36.42, 36.9, 36.4, 36.38, 36.41].map((c, i) => ({
      offset: 8 + i,
      celsius: c,
    }));
    expect(detectThermalShift(temps, 0.2)).toBeUndefined();
  });

  it('a period that has not arrived rules out early ovulation', () => {
    const p = ovulationPosterior({ ...base, asOf: '2026-11-05' }); // cycle day 36
    expect(p.mean).toBeGreaterThan(19);
  });

  it('fertile probability is high in the five days before the mode and zero long after', () => {
    const p = ovulationPosterior({
      ...base,
      asOf: '2026-10-21',
      observations: { lhTests: [{ date: '2026-10-15', result: 'positive' }] },
    });
    expect(fertileProbability(p, p.mode - 2)).toBeGreaterThan(0.8);
    expect(fertileProbability(p, p.mode + 6)).toBeLessThan(0.02);
  });
});

describe('forecast', () => {
  const data = regular('2026-05-01', 6, 28);

  it('needs at least one period', () => {
    expect(forecast({ periods: [] }, { asOf: '2026-10-20' }).status).toBe('needs-data');
  });

  it('is deterministic for a given seed', () => {
    const a = forecast(data, { asOf: '2026-09-25', seed: 's' });
    const b = forecast(data, { asOf: '2026-09-25', seed: 's' });
    expect(a.days).toEqual(b.days);
  });

  it('produces coherent, ordered seasons and valid probabilities', () => {
    const f = forecast(data, { asOf: '2026-09-25', seed: 's', horizon: 60 });
    expect(f.status).toBe('ok');
    const order = ['menstrual', 'follicular', 'ovulatory', 'luteal', 'premenstrual'];
    for (let i = 1; i < f.days.length; i++) {
      const a = order.indexOf(f.days[i - 1]!.phase);
      const b = order.indexOf(f.days[i]!.phase);
      expect(b === a || b === a + 1 || (a === 4 && b === 0)).toBe(true);
    }
    for (const d of f.days) {
      for (const v of [d.fertile, d.bleeding, d.conception]) expect(v).toBeGreaterThanOrEqual(0);
      for (const v of [d.fertile, d.bleeding, d.conception]) expect(v).toBeLessThanOrEqual(1);
      const s = d.seasonProbs;
      expect(s.winter + s.spring + s.summer + s.autumn).toBeCloseTo(1, 6);
    }
  });

  it('puts the best days inside the fertile window, before ovulation', () => {
    const f = forecast(data, { asOf: '2026-09-27', seed: 's' });
    const w = f.fertileWindow!;
    expect(w.best.length).toBeGreaterThan(0);
    for (const b of w.best) {
      expect(diffDays(w.start, b)).toBeGreaterThanOrEqual(0);
      expect(diffDays(b, w.end)).toBeGreaterThanOrEqual(0);
    }
  });

  it('never predicts the next period in the past', () => {
    const f = forecast(data, { asOf: '2026-10-14', seed: 's' }); // cycle day 32 of a 28-day woman
    expect(diffDays('2026-10-14', f.nextPeriod!.date)).toBeGreaterThanOrEqual(1);
    expect(diffDays('2026-10-14', f.nextPeriod!.earliest)).toBeGreaterThanOrEqual(1);
  });

  it('marks a very long cycle late, and a positive test pregnant', () => {
    expect(forecast(data, { asOf: '2026-10-25', seed: 's' }).status).toBe('late');
    const pregnant = forecast(
      { ...data, pregnancyTests: [{ date: '2026-10-10', positive: true }] },
      { asOf: '2026-10-12', seed: 's' },
    );
    expect(pregnant.status).toBe('pregnant');
    expect(pregnant.nextPeriod).toBeUndefined();
  });

  it('is more confident with sensors than with a calendar alone', () => {
    const sim = simulate({ seed: 'conf', start: '2026-01-02', cycles: 8, sensors: { lh: true, bbt: true } });
    const lastStart = sim.truth[7]!.start;
    const asOf = addDays(sim.truth[7]!.ovulation, 3);
    const withSensors = forecast(sim.data, { asOf, seed: 'x' });
    const calendarOnly = forecast({ periods: sim.data.periods }, { asOf, seed: 'x' });
    expect(withSensors.cycleStart).toBe(lastStart);
    expect(withSensors.ovulation!.sd).toBeLessThan(calendarOnly.ovulation!.sd);
  });

  it('runs fast enough for a phone', () => {
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) forecast(data, { asOf: '2026-09-25', seed: String(i) });
    expect((performance.now() - t0) / 10).toBeLessThan(150);
  });
});
