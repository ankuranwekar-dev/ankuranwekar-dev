import { describe, expect, it } from 'vitest';
import { addDays, diffDays, weekday } from '../src/dates';
import { LIBRARY } from '../src/nudges/library';
import { findAnchors, planNudges, summerShareOfBigGestures, type PlanInput } from '../src/nudges/planner';
import { fillTokens } from '../src/nudges/render';
import type { HistoryEntry } from '../src/nudges/types';
import { PLAYBOOK, PREFS, regularData, snapshotFor } from './helpers';

const data = regularData('2026-05-03', 6, 29);
const asOf = '2026-09-20';

function input(over: Partial<PlanInput> = {}): PlanInput {
  const snap = snapshotFor(data, asOf, over.share ?? 'fertility', over.intent ?? 'closer');
  return {
    days: snap.days,
    from: asOf,
    horizon: 84,
    intent: 'closer',
    share: 'fertility',
    playbook: PLAYBOOK,
    prefs: PREFS,
    seed: 'pair-1',
    ...over,
  };
}

describe('library', () => {
  it('has unique ids and sane fields', () => {
    const ids = new Set<string>();
    for (const t of LIBRARY) {
      expect(ids.has(t.id), t.id).toBe(false);
      ids.add(t.id);
      expect(t.title.length, t.id).toBeLessThanOrEqual(60);
      expect(t.detail.length, t.id).toBeLessThanOrEqual(200);
      expect(Object.keys(t.phases).length, t.id).toBeGreaterThan(0);
      for (const v of Object.values(t.phases)) expect(v).toBeGreaterThan(0);
    }
    expect(LIBRARY.length).toBeGreaterThanOrEqual(70);
  });

  it('renders every template without leftover tokens, with or without a playbook', () => {
    for (const t of LIBRARY) {
      for (const pb of [PLAYBOOK, { name: 'Maya' }]) {
        const s = fillTokens(`${t.title} ${t.detail}`, pb, { id: 'm', text: 'her sister’s interview', date: '2026-09-01' });
        expect(s, t.id).not.toMatch(/\{\w+\}/);
      }
    }
  });
});

describe('planner', () => {
  it('is deterministic', () => {
    expect(planNudges(input())).toEqual(planNudges(input()));
  });

  it('sends at most one notification per day', () => {
    const plan = planNudges(input({ prefs: { ...PREFS, cadence: 'devoted' } }));
    const dates = plan.items.map((i) => i.date);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('honors cadence', () => {
    const count = (cadence: 'light' | 'steady' | 'devoted') =>
      planNudges(input({ prefs: { ...PREFS, cadence } })).items.length / 12; // per week over 84 days
    expect(count('light')).toBeGreaterThan(2.3);
    expect(count('light')).toBeLessThan(4);
    expect(count('steady')).toBeGreaterThan(4);
    expect(count('steady')).toBeLessThan(6);
    expect(count('devoted')).toBeGreaterThan(6);
  });

  it('leaves no long silences', () => {
    const plan = planNudges(input({ prefs: { ...PREFS, cadence: 'light' } }));
    const targets = [...new Set(plan.items.map((i) => i.targetDate))].sort();
    for (let i = 1; i < targets.length; i++) expect(diffDays(targets[i - 1]!, targets[i]!)).toBeLessThanOrEqual(5);
  });

  it('never only then: big gestures are capped in her ovulatory days and present outside them', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      for (const intent of ['closer', 'trying'] as const) {
        const plan = planNudges(input({ seed, intent }));
        const anchors = findAnchors(plan.items.length ? input({ seed, intent }).days : []);
        // At most one big gesture per ovulatory run.
        for (const start of anchors.fertileStart) {
          const runEnd = addDays(start, 6);
          const big = plan.items.filter((i) => i.big && i.targetDate >= start && i.targetDate <= runEnd);
          expect(big.length, `${seed}/${intent}`).toBeLessThanOrEqual(1);
          const gifts = plan.items.filter((i) => i.kind === 'gift' && i.targetDate >= start && i.targetDate <= runEnd);
          expect(gifts.length).toBeLessThanOrEqual(1);
        }
        expect(plan.items.some((i) => i.big && i.phase !== 'ovulatory'), `${seed}/${intent}`).toBe(true);
        expect(summerShareOfBigGestures(plan.items)).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('respects her never-list, his budget and the playbook', () => {
    const plan = planNudges(
      input({
        playbook: { ...PLAYBOOK, never: ['public', 'flowers-cut', 'surprise'] },
        prefs: { ...PREFS, budget: 1 },
      }),
    );
    const byId = new Map(LIBRARY.map((t) => [t.id, t]));
    for (const i of plan.items) {
      const t = byId.get(i.templateId)!;
      expect(t.tags ?? []).not.toContain('public');
      expect(t.tags ?? []).not.toContain('flowers-cut');
      expect(t.tags ?? []).not.toContain('surprise');
      expect(i.cost).toBeLessThanOrEqual(1);
    }
    const noTreat = planNudges(input({ playbook: { name: 'Maya' } }));
    expect(noTreat.items.some((i) => i.templateId === 'gift.treat')).toBe(false);
  });

  it('never repeats a nudge inside its cooldown, nor the same kind two days running', () => {
    const plan = planNudges(input({ prefs: { ...PREFS, cadence: 'devoted' } }));
    const byId = new Map(LIBRARY.map((t) => [t.id, t]));
    for (const a of plan.items) {
      for (const b of plan.items) {
        if (a === b || a.templateId !== b.templateId) continue;
        expect(Math.abs(diffDays(a.targetDate, b.targetDate))).toBeGreaterThanOrEqual(byId.get(a.templateId)!.cooldown ?? 21);
      }
    }
    const sorted = [...plan.items].sort((a, b) => (a.targetDate < b.targetDate ? -1 : 1));
    for (let i = 1; i < sorted.length; i++) {
      const anchored = byId.get(sorted[i]!.templateId)!.anchor || byId.get(sorted[i - 1]!.templateId)!.anchor;
      if (!anchored && diffDays(sorted[i - 1]!.targetDate, sorted[i]!.targetDate) === 1) {
        expect(sorted[i]!.kind).not.toBe(sorted[i - 1]!.kind);
      }
    }
  });

  it('gives lead time: notifications come before the day they pay off', () => {
    const plan = planNudges(input());
    const byId = new Map(LIBRARY.map((t) => [t.id, t]));
    for (const i of plan.items) {
      const t = byId.get(i.templateId)!;
      const expected = t.when === 'morning' ? Math.max(t.leadDays ?? 0, 1) : t.leadDays ?? 0;
      expect(diffDays(i.date, i.targetDate)).toBe(expected);
      expect(i.date >= asOf).toBe(true);
      if (t.when === 'morning') expect(i.notifyAt).toBe('20:30');
      if (t.weekendOnly) expect([0, 6]).toContain(weekday(i.targetDate));
    }
  });

  it('uses the Gulf weekend when asked', () => {
    const plan = planNudges(input({ prefs: { ...PREFS, weekendDays: [5, 6] } }));
    const byId = new Map(LIBRARY.map((t) => [t.id, t]));
    for (const i of plan.items) if (byId.get(i.templateId)!.weekendOnly) expect([5, 6]).toContain(weekday(i.targetDate));
  });

  it('adds his trying-to-conceive prep only when she shares fertility and they are trying', () => {
    const trying = planNudges(input({ intent: 'trying' }));
    expect(trying.items.some((i) => i.templateId === 'prep.clear-evenings')).toBe(true);
    expect(trying.items.some((i) => i.templateId === 'prep.no-calendar-talk')).toBe(true);
    const closer = planNudges(input({ intent: 'closer' }));
    expect(closer.items.some((i) => i.kind === 'prep')).toBe(false);
    const seasonsOnly = planNudges(input({ intent: 'trying', share: 'seasons' }));
    expect(seasonsOnly.items.some((i) => i.templateId === 'prep.clear-evenings')).toBe(false);
  });

  it('schedules "clear your evenings" two days before her fertile window', () => {
    const inp = input({ intent: 'trying' });
    const plan = planNudges(inp);
    const anchors = findAnchors(inp.days);
    const clear = plan.items.filter((i) => i.templateId === 'prep.clear-evenings');
    for (const c of clear) {
      expect(anchors.fertileStart.some((f) => Math.abs(diffDays(c.targetDate, addDays(f, -2))) <= 1)).toBe(true);
    }
  });

  it('restocks her period kit before the period, not during it', () => {
    const plan = planNudges(input({ share: 'period', intent: 'basics' }));
    const kit = plan.items.filter((i) => i.templateId === 'care.period-kit');
    expect(kit.length).toBeGreaterThan(0);
    for (const k of kit) expect(k.phase).toBe('premenstrual');
  });

  it('with only period sharing, plans nothing that depends on hidden phases', () => {
    const plan = planNudges(input({ share: 'period', intent: 'basics' }));
    for (const i of plan.items) {
      if (i.phase) expect(['menstrual', 'premenstrual']).toContain(i.phase);
    }
    expect(plan.items.length).toBeGreaterThan(20);
  });

  it('follows up on things she mentioned', () => {
    const plan = planNudges(input({ mentions: [{ id: 'm1', text: 'her sister’s job interview', date: '2026-09-18' }] }));
    const f = plan.items.find((i) => i.mentionId === 'm1');
    expect(f?.detail).toContain('her sister’s job interview');
  });

  it('learns: kinds he skips appear less, kinds she hearts appear more', () => {
    const history: HistoryEntry[] = [];
    for (let i = 0; i < 12; i++) {
      history.push({ nudgeId: `x${i}`, kind: 'words', date: addDays('2026-08-01', i), outcome: 'skipped' });
      history.push({ nudgeId: `y${i}`, kind: 'service', date: addDays('2026-08-01', i), outcome: 'hearted' });
    }
    const base = planNudges(input());
    const learned = planNudges(input({ history }));
    const n = (p: typeof base, k: string) => p.items.filter((i) => i.kind === k).length;
    expect(n(learned, 'words')).toBeLessThan(n(base, 'words'));
    expect(n(learned, 'service')).toBeGreaterThanOrEqual(n(base, 'service'));
  });

  it('keeps the lock screen discreet by default', () => {
    const plan = planNudges(input());
    for (const i of plan.items) {
      const text = `${i.lockScreen.title} ${i.lockScreen.body}`.toLowerCase();
      for (const word of ['period', 'fertile', 'ovulat', 'cycle', 'pms', 'maya', 'peonies']) expect(text).not.toContain(word);
    }
    const detailed = planNudges(input({ prefs: { ...PREFS, detailedNotifications: true } }));
    expect(detailed.items[0]!.lockScreen.title).toBe(detailed.items[0]!.title);
  });
});
