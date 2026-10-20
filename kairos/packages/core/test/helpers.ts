import { addDays } from '../src/dates';
import { forecast } from '../src/cycle/forecast';
import { buildSnapshot } from '../src/share/snapshot';
import type { Intent, PartnerPrefs, Playbook, ShareLevel } from '../src/nudges/types';
import type { CycleData } from '../src/cycle/types';

export const PLAYBOOK: Playbook = {
  name: 'Maya',
  flowers: 'peonies',
  treat: 'salted dark chocolate',
  scent: 'Jo Malone Peony & Blush Suede',
  drink: 'oat flat white',
  comfortFood: 'pho',
  cuisine: 'Japanese',
  place: 'the beach',
  music: 'Norah Jones',
  loves: { presence: 0.9, words: 0.6, service: 0.8, gifts: 0.4, touch: 0.7, adventure: 0.6 },
};

export const PREFS: PartnerPrefs = { cadence: 'steady', budget: 3, notifyAt: '08:30' };

export function regularData(start: string, n: number, len: number): CycleData {
  return {
    periods: Array.from({ length: n }, (_, i) => ({ start: addDays(start, i * len), end: addDays(start, i * len + 4) })),
  };
}

export function snapshotFor(
  data: CycleData,
  asOf: string,
  share: ShareLevel = 'fertility',
  intent: Intent = 'closer',
  playbook: Playbook = PLAYBOOK,
) {
  const f = forecast(data, { asOf, seed: 't', lookback: 40, horizon: 120 });
  return buildSnapshot(f, { intent, share, playbook, lookback: 40, horizon: 120, now: new Date(`${asOf}T08:00:00Z`) });
}
