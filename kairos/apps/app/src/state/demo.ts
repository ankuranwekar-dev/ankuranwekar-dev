import { addDays, diffDays, simulate, type CycleData, type ISODate, type Mention, type Playbook } from '@kairos/core';

/**
 * Demo couple: Maya and Alex. Maya's cycles are simulated (with an LH kit and
 * a smartwatch) and anchored so that "today" is cycle day 10: spring, with
 * summer two or three days out — the most interesting moment to land on.
 *
 * The full simulated future is kept so the demo's time-travel control can
 * move forward and watch an LH positive arrive, ovulation get confirmed and
 * the next period begin, exactly as it would in real life.
 */

export const DEMO_PLAYBOOK: Playbook = {
  name: 'Maya',
  flowers: 'peonies',
  treat: 'salted dark chocolate',
  scent: 'Jo Malone Peony & Blush Suede',
  drink: 'oat flat white',
  comfortFood: 'pho',
  cuisine: 'Japanese',
  place: 'the beach',
  music: 'Norah Jones',
  loves: { presence: 0.9, words: 0.6, service: 0.85, gifts: 0.45, touch: 0.75, adventure: 0.6 },
  never: ['public'],
  notes: ['Allergic to lilies', 'Not a morning person before coffee', 'Loves handwritten anything'],
};

const DEMO_DAY = 10;

function shift<T extends { date: ISODate }>(xs: T[] | undefined, d: number): T[] {
  return (xs ?? []).map((x) => ({ ...x, date: addDays(x.date, d) }));
}

export function demoCycleData(today: ISODate): CycleData {
  const sim = simulate({
    seed: 'maya',
    start: '2000-01-01',
    cycles: 12,
    woman: { cycleMean: 29, cycleSd: 1.4, lutealMean: 12.6, lutealSd: 0.7, periodLength: 5 },
    sensors: { lh: true, wrist: true },
  });
  const anchor = sim.truth[6]!.start; // seventh cycle is "now"
  const delta = diffDays(anchor, addDays(today, -(DEMO_DAY - 1)));
  return {
    periods: sim.data.periods.map((p) => ({
      start: addDays(p.start, delta),
      ...(p.end ? { end: addDays(p.end, delta) } : {}),
    })),
    lhTests: shift(sim.data.lhTests, delta),
    temperatures: shift(sim.data.temperatures, delta),
    mucus: [],
  };
}

/** Everything she would have logged by `asOf` — the demo's time-travel window. */
export function visibleUntil(data: CycleData, asOf: ISODate): CycleData {
  const keep = <T extends { date: ISODate }>(xs: T[] | undefined) => (xs ?? []).filter((x) => x.date <= asOf);
  return {
    ...data,
    periods: data.periods.filter((p) => p.start <= asOf).map((p) => (p.end && p.end > asOf ? { start: p.start } : p)),
    lhTests: keep(data.lhTests),
    temperatures: keep(data.temperatures),
    mucus: keep(data.mucus),
    pregnancyTests: keep(data.pregnancyTests),
  };
}

export function demoMentions(today: ISODate): Mention[] {
  return [
    { id: 'demo-m1', text: 'her sister’s job interview on Thursday', date: addDays(today, -4) },
    { id: 'demo-m2', text: 'the ceramics studio she walked past', date: addDays(today, -11) },
  ];
}
