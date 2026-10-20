/**
 * How good is the forecast, and how much do sensors help?
 *
 * Simulates women with realistic between- and within-woman variability
 * (see src/sim/simulate.ts), gives the engine six cycles of history, then
 * scores three further cycles in real time — each morning the engine sees only
 * what she would have logged by then.
 *
 *   npm run bench            (≈400 women)
 *   BENCH_WOMEN=1000 npm run bench
 *
 * Synthetic data cannot prove real-world accuracy; it can show the relative
 * value of each data source under stated assumptions, and catch regressions.
 */

import { addDays, diffDays } from '../src/dates';
import { estimateStats } from '../src/cycle/history';
import { bestWindowEnd, fertileProbability, ovulationPosterior } from '../src/cycle/ovulation';
import type { CycleData } from '../src/cycle/types';
import { simulate, withSensors } from '../src/sim/simulate';

const WOMEN = Number(process.env.BENCH_WOMEN ?? 400);
const HISTORY = 6;
const TEST = 3;

type Mode = { name: string; keep: { lh?: boolean; bbt?: boolean; wrist?: boolean; mucus?: boolean } };
const MODES: Mode[] = [
  { name: 'Calendar only', keep: {} },
  { name: '+ cervical mucus', keep: { mucus: true } },
  { name: '+ wrist temperature', keep: { wrist: true } },
  { name: '+ BBT thermometer', keep: { bbt: true } },
  { name: '+ LH tests', keep: { lh: true } },
  { name: '+ LH + mucus', keep: { lh: true, mucus: true } },
  { name: '+ LH + wrist temp', keep: { lh: true, wrist: true } },
  { name: 'Everything', keep: { lh: true, wrist: true, bbt: true, mucus: true } },
];

interface Tally {
  cycles: number;
  // Prediction made on cycle day 1 (what a calendar app shows when the period starts).
  day1Exact: number;
  day1Within1: number;
  day1Within2: number;
  // Real-time "summer" flag: P(fertile) ≥ 0.5 on the morning of each day.
  fertileDays: number;
  fertileFlagged: number;
  flagged: number;
  flaggedCorrect: number;
  // Both of the two best days (ovulation −2, −1) flagged on the morning they happened.
  peakCaptured: number;
  // Retrospective: ovulation located within ±1 day, five days after it happened.
  retroWithin1: number;
}

const empty = (): Tally => ({
  cycles: 0,
  day1Exact: 0,
  day1Within1: 0,
  day1Within2: 0,
  fertileDays: 0,
  fertileFlagged: 0,
  flagged: 0,
  flaggedCorrect: 0,
  peakCaptured: 0,
  retroWithin1: 0,
});

function restrict(data: CycleData, until: string): CycleData {
  const keep = <T extends { date: string }>(xs: T[] | undefined) => (xs ?? []).filter((x) => x.date <= until);
  return {
    periods: data.periods.filter((p) => p.start <= until).map((p) => (p.end && p.end > until ? { start: p.start } : p)),
    lhTests: keep(data.lhTests),
    temperatures: keep(data.temperatures),
    mucus: keep(data.mucus),
  };
}

const tallies = new Map(MODES.map((m) => [m.name, empty()]));
const t0 = Date.now();

for (let w = 0; w < WOMEN; w++) {
  const sim = simulate({
    seed: `bench-${w}`,
    start: '2025-01-01',
    cycles: HISTORY + TEST,
    sensors: { lh: true, bbt: true, wrist: true, mucus: true },
  });

  for (const mode of MODES) {
    const all = withSensors(sim.data, mode.keep);
    const tally = tallies.get(mode.name)!;

    for (let c = HISTORY; c < HISTORY + TEST; c++) {
      const cycle = sim.truth[c]!;
      const trueOv = diffDays(cycle.start, cycle.ovulation);
      const history = restrict(all, addDays(cycle.start, -1));
      const stats = estimateStats(history);
      const priorMean = stats.cycleMean - stats.lutealMean;
      const priorSd = Math.sqrt(Math.max(stats.cycleSd ** 2 - stats.lutealSd ** 2, 1.5 ** 2));
      const postAsOf = (asOf: string) => {
        const seen = restrict(all, asOf);
        return ovulationPosterior({
          cycleStart: cycle.start,
          priorMean,
          priorSd,
          lutealMean: stats.lutealMean,
          lutealSd: stats.lutealSd,
          asOf,
          observations: { lhTests: seen.lhTests ?? [], temperatures: seen.temperatures ?? [], mucus: seen.mucus ?? [] },
        });
      };

      tally.cycles += 1;
      const day1 = bestWindowEnd(postAsOf(cycle.start));
      const err = Math.abs(day1 - trueOv);
      if (err === 0) tally.day1Exact += 1;
      if (err <= 1) tally.day1Within1 += 1;
      if (err <= 2) tally.day1Within2 += 1;

      let peaks = 0;
      for (let k = 5; k <= trueOv + 3 && k < cycle.length; k++) {
        const date = addDays(cycle.start, k);
        const p = fertileProbability(postAsOf(date), k);
        const truly = k >= trueOv - 5 && k <= trueOv;
        if (truly) tally.fertileDays += 1;
        if (p >= 0.5) {
          tally.flagged += 1;
          if (truly) {
            tally.flaggedCorrect += 1;
            tally.fertileFlagged += 1;
            if (k === trueOv - 2 || k === trueOv - 1) peaks += 1;
          }
        }
      }
      if (peaks === 2) tally.peakCaptured += 1;

      const retro = postAsOf(addDays(cycle.ovulation, 5));
      if (Math.abs(retro.mode - trueOv) <= 1) tally.retroWithin1 += 1;
    }
  }
}

const pct = (n: number, d: number) => `${((100 * n) / Math.max(d, 1)).toFixed(0)}%`.padStart(5);
console.log(`\nKairos forecast benchmark — ${WOMEN} simulated women × ${TEST} cycles (${HISTORY} cycles of history each)\n`);
console.log(
  'Data source'.padEnd(22),
  'Day-1 exact',
  ' ±1 day',
  ' ±2 days',
  ' Fertile days caught',
  ' Flag precision',
  ' Both best days caught',
  ' Located by ov+5 (±1)',
);
for (const m of MODES) {
  const t = tallies.get(m.name)!;
  console.log(
    m.name.padEnd(22),
    pct(t.day1Exact, t.cycles).padStart(11),
    pct(t.day1Within1, t.cycles).padStart(7),
    pct(t.day1Within2, t.cycles).padStart(8),
    pct(t.fertileFlagged, t.fertileDays).padStart(20),
    pct(t.flaggedCorrect, t.flagged).padStart(15),
    pct(t.peakCaptured, t.cycles).padStart(22),
    pct(t.retroWithin1, t.cycles).padStart(22),
  );
}
console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
