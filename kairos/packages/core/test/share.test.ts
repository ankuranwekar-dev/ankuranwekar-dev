import { describe, expect, it } from 'vitest';
import { forecast } from '../src/cycle/forecast';
import { buildSnapshot, describeShare } from '../src/share/snapshot';
import { respondToSignal, SIGNALS } from '../src/nudges/signals';
import { PLAYBOOK, regularData } from './helpers';

const data = regularData('2026-05-03', 6, 29);

describe('snapshot', () => {
  const f = forecast(data, { asOf: '2026-09-20', seed: 's' });

  it('period level reveals only bleeding and premenstrual days', () => {
    const s = buildSnapshot(f, { intent: 'basics', share: 'period', playbook: PLAYBOOK });
    for (const d of s.days) {
      if (d.phase) expect(['menstrual', 'premenstrual']).toContain(d.phase);
      expect(d.fertile).toBeUndefined();
      expect(d.peak).toBeUndefined();
    }
    expect(s.fertileWindow).toBeUndefined();
    expect(s.nextPeriod).toBeDefined();
  });

  it('seasons level reveals phases but no fertility numbers', () => {
    const s = buildSnapshot(f, { intent: 'closer', share: 'seasons', playbook: PLAYBOOK });
    expect(s.days.some((d) => d.phase === 'ovulatory')).toBe(true);
    expect(s.days.every((d) => d.fertile === undefined)).toBe(true);
    expect(s.fertileWindow).toBeUndefined();
  });

  it('fertility level adds probabilities and the window', () => {
    const s = buildSnapshot(f, { intent: 'trying', share: 'fertility', playbook: PLAYBOOK });
    expect(s.days.some((d) => (d.fertile ?? 0) > 0.5)).toBe(true);
    expect(s.fertileWindow).toBeDefined();
  });

  it('pauses on a positive pregnancy test: he never hears it from an app', () => {
    const pf = forecast(
      { ...data, pregnancyTests: [{ date: '2026-09-20', positive: true }] },
      { asOf: '2026-09-20', seed: 's' },
    );
    const s = buildSnapshot(pf, { intent: 'trying', share: 'fertility', playbook: PLAYBOOK });
    expect(s.status).toBe('paused');
    expect(s.days).toEqual([]);
    expect(JSON.stringify(s)).not.toMatch(/pregnan/i);
  });

  it('never shows him a late period as late', () => {
    const late = forecast(data, { asOf: '2026-10-30', seed: 's' });
    expect(late.status).toBe('late');
    const s = buildSnapshot(late, { intent: 'closer', share: 'seasons', playbook: PLAYBOOK });
    expect(s.status).toBe('ok');
    expect(s.nextPeriod!.date > '2026-10-30').toBe(true);
    expect(JSON.stringify(s)).not.toMatch(/\blate\b/i);
  });

  it('describes exactly what he sees', () => {
    expect(describeShare('period', 'basics')).not.toContain('Which season you are in, every day');
    expect(describeShare('fertility', 'trying')).toContain('Your fertile window and best days');
  });
});

describe('signals', () => {
  it('every signal produces a usable prompt', () => {
    for (const s of SIGNALS) {
      const r = respondToSignal({ id: s.id, at: '2026-10-20T15:00:00Z' }, PLAYBOOK);
      expect(r.title).not.toMatch(/\{/);
      expect(r.detail).not.toMatch(/\{/);
      expect(r.lockScreen.body.length).toBeGreaterThan(5);
    }
  });

  it('a craving uses her words, or her favorite treat', () => {
    expect(respondToSignal({ id: 'craving', at: '2026-10-20T15:00:00Z', note: 'fries' }, PLAYBOOK).title).toBe(
      'She’s craving fries',
    );
    expect(respondToSignal({ id: 'craving', at: '2026-10-20T15:00:00Z' }, PLAYBOOK).title).toBe(
      'She’s craving salted dark chocolate',
    );
  });

  it('"need space" quiets other nudges', () => {
    const r = respondToSignal({ id: 'space', at: '2026-10-20T15:00:00.000Z' }, PLAYBOOK);
    expect(r.quietUntil).toBe('2026-10-21T09:00:00.000Z');
  });
});
