/**
 * The planner decides what he is nudged to do, and when.
 *
 * It plans a few weeks at a time rather than picking greedily each morning,
 * because good gestures need lead time (a table booked, flowers delivered) and
 * because the most important rule is a property of the whole plan, not of any
 * single day:
 *
 *   NEVER ONLY THEN. If his flowers only ever arrive in her fertile week, she
 *   will notice within two or three cycles, and every gesture after that reads
 *   as a transaction. So big gestures are capped inside her ovulatory days and
 *   actively encouraged outside them, and gifts in particular never cluster
 *   there.
 *
 * Everything is seeded: the same inputs always produce the same plan.
 */

import { addDays, diffDays, weekday, type ISODate } from '../dates';
import { PHASE_COPY, type Phase } from '../cycle/seasons';
import { seededRandom, sampleIndex } from '../random';
import { LIBRARY } from './library';
import { fillTokens, lockScreenCopy, playbookSatisfies } from './render';
import {
  SHARE_ORDER,
  type AnchorPoint,
  type Cadence,
  type HistoryEntry,
  type Intent,
  type LoveDimension,
  type Mention,
  type NudgeKind,
  type NudgeTemplate,
  type PartnerPrefs,
  type PlannedNudge,
  type Playbook,
  type ShareLevel,
  type SharedDay,
} from './types';

export interface PlanInput {
  /** Her shared timeline. May start before `from`; earlier days help locate anchors. */
  days: SharedDay[];
  from: ISODate;
  horizon?: number;
  intent: Intent;
  share: ShareLevel;
  playbook: Playbook;
  prefs: PartnerPrefs;
  history?: HistoryEntry[];
  mentions?: Mention[];
  seed: string;
  library?: readonly NudgeTemplate[];
}

export interface Plan {
  items: PlannedNudge[];
  /** Days inside the window with nothing planned. Rest is part of the design. */
  restDays: ISODate[];
}

const RATE: Record<Cadence, number> = { light: 3 / 7, steady: 5 / 7, devoted: 1 };
const MAX_REST: Record<Cadence, number> = { light: 3, steady: 2, devoted: 0 };

const INTENSITY: Record<Phase, number> = {
  menstrual: 1.15,
  follicular: 0.85,
  ovulatory: 1.1,
  luteal: 0.85,
  premenstrual: 1.15,
};

const KIND_TO_LOVE: Record<NudgeKind, LoveDimension[]> = {
  presence: ['presence'],
  words: ['words'],
  service: ['service'],
  gift: ['gifts'],
  touch: ['touch'],
  adventure: ['adventure'],
  romance: ['touch', 'words', 'adventure'],
  care: ['service'],
  prep: [],
};

const ALL_PHASES: Phase[] = ['menstrual', 'follicular', 'ovulatory', 'luteal', 'premenstrual'];

/** Minimum days between any two big gestures. */
const BIG_SPACING = 6;

export function findAnchors(days: SharedDay[]): Record<AnchorPoint, ISODate[]> {
  const out: Record<AnchorPoint, ISODate[]> = {
    periodStart: [],
    fertileStart: [],
    ovulation: [],
    lutealStart: [],
    premenstrualStart: [],
  };
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (let i = 0; i < sorted.length; i++) {
    const d = sorted[i]!;
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    const starts = (p: Phase) => d.phase === p && (!prev || prev.phase !== p);
    if (starts('menstrual') && prev) out.periodStart.push(d.date);
    if (starts('ovulatory') && prev) out.fertileStart.push(d.date);
    // Ovulatory run is ovulation−5 … ovulation+1, so ovulation is the run's second-to-last day.
    if (d.phase === 'ovulatory' && next && next.phase !== 'ovulatory') out.ovulation.push(addDays(d.date, -1));
    if (starts('luteal') && prev) out.lutealStart.push(d.date);
    if (starts('premenstrual') && prev) out.premenstrualStart.push(d.date);
  }
  return out;
}

function notifyTime(t: NudgeTemplate, prefs: PartnerPrefs): string {
  if (t.when === 'morning') return '20:30';
  if (t.when === 'midday' && prefs.notifyAt > '11:30') return '11:30';
  return prefs.notifyAt;
}

/** Morning gestures are announced the evening before; lead-time gestures `leadDays` before. */
function notifyOffset(t: NudgeTemplate): number {
  const lead = t.leadDays ?? 0;
  return t.when === 'morning' ? Math.max(lead, 1) : lead;
}

function eligibleBase(t: NudgeTemplate, input: PlanInput): boolean {
  if (t.intents && !t.intents.includes(input.intent)) return false;
  if (t.minShare && SHARE_ORDER[input.share] < SHARE_ORDER[t.minShare]) return false;
  if (t.cost > input.prefs.budget) return false;
  if (!playbookSatisfies(t, input.playbook)) return false;
  const never = new Set(input.playbook.never ?? []);
  if ((t.tags ?? []).some((tag) => never.has(tag))) return false;
  return true;
}

function affinity(t: NudgeTemplate, phase: Phase | undefined): number {
  if (phase) return t.phases[phase] ?? 0;
  // Her share level hides this day's phase: only broadly applicable nudges qualify.
  const defined = ALL_PHASES.filter((p) => t.phases[p] !== undefined);
  if (defined.length < 4) return 0;
  return (defined.reduce((s, p) => s + t.phases[p]!, 0) / defined.length) * 0.9;
}

function loveWeight(kind: NudgeKind, playbook: Playbook): number {
  const dims = KIND_TO_LOVE[kind];
  if (dims.length === 0) return 1;
  const v = dims.reduce((s, d) => s + (playbook.loves?.[d] ?? 0.5), 0) / dims.length;
  return 0.5 + v;
}

function learnedWeights(history: HistoryEntry[]): Record<NudgeKind, number> {
  const tally = new Map<NudgeKind, { good: number; bad: number }>();
  for (const h of history) {
    const t = tally.get(h.kind) ?? { good: 0, bad: 0 };
    if (h.outcome === 'done') t.good += 1;
    if (h.outcome === 'hearted') t.good += 2;
    if (h.outcome === 'skipped') t.bad += 1;
    tally.set(h.kind, t);
  }
  const out = {} as Record<NudgeKind, number>;
  for (const k of [
    'presence',
    'words',
    'service',
    'gift',
    'touch',
    'adventure',
    'romance',
    'care',
    'prep',
  ] as NudgeKind[]) {
    const t = tally.get(k) ?? { good: 0, bad: 0 };
    const mean = (1 + t.good) / (2 + t.good + t.bad); // Beta(1,1) posterior mean
    out[k] = 0.6 + 0.8 * mean;
  }
  return out;
}

interface Placed {
  t: NudgeTemplate;
  target: ISODate;
  notify: ISODate;
  phase: Phase | undefined;
  cycle: number;
  mention?: Mention;
}

export function planNudges(input: PlanInput): Plan {
  const horizon = input.horizon ?? 21;
  const library = input.library ?? LIBRARY;
  const end = addDays(input.from, horizon - 1);
  const history = input.history ?? [];
  const weekend = new Set(input.prefs.weekendDays ?? [0, 6]);
  const byDate = new Map(input.days.map((d) => [d.date, d]));
  const learned = learnedWeights(history);
  const anchors = findAnchors(input.days);

  // Cycle index per date, so per-cycle rules ("one big gesture in her summer") can be enforced.
  const cycleStarts = [...anchors.periodStart].sort();
  const cycleOf = (date: ISODate) => cycleStarts.filter((s) => s <= date).length;

  const lastUse = new Map<string, ISODate>();
  const lastKindUse = new Map<NudgeKind, ISODate>();
  for (const h of history) {
    if (h.outcome === 'snoozed') continue;
    if (!lastUse.has(h.nudgeId) || lastUse.get(h.nudgeId)! < h.date) lastUse.set(h.nudgeId, h.date);
    if (!lastKindUse.has(h.kind) || lastKindUse.get(h.kind)! < h.date) lastKindUse.set(h.kind, h.date);
  }

  // "Not today" on a nudge keeps it off today only, without counting against its kind.
  const snoozedToday = new Set(
    history.filter((h) => h.outcome === 'snoozed' && h.date === input.from).map((h) => h.nudgeId),
  );

  const placed: Placed[] = [];
  const notifyTaken = new Set<ISODate>();
  const targetTaken = new Set<ISODate>();
  const openMentions = (input.mentions ?? []).filter((m) => !m.resolved).sort((a, b) => (a.date < b.date ? -1 : 1));
  const usedMentions = new Set<string>();

  const inWindow = (d: ISODate) => d >= input.from && d <= end;

  const cooldownOk = (t: NudgeTemplate, target: ISODate) => {
    const cd = t.cooldown ?? 21;
    const last = lastUse.get(t.id);
    if (last && diffDays(last, target) < cd && diffDays(last, target) >= 0) return false;
    // Also check against everything already placed in this plan, in both directions.
    return !placed.some((p) => p.t.id === t.id && Math.abs(diffDays(p.target, target)) < cd);
  };

  const place = (t: NudgeTemplate, target: ISODate, mention?: Mention) => {
    const notify = addDays(target, -notifyOffset(t));
    const phase = byDate.get(target)?.phase;
    placed.push({ t, target, notify, phase, cycle: cycleOf(target), ...(mention ? { mention } : {}) });
    notifyTaken.add(notify);
    targetTaken.add(target);
    lastUse.set(t.id, target);
    lastKindUse.set(t.kind, target);
    if (mention) usedMentions.add(mention.id);
  };

  // ---- 1. Anchored nudges -------------------------------------------------
  for (const t of library) {
    if (!t.anchor || !eligibleBase(t, input)) continue;
    for (const a of anchors[t.anchor.to]) {
      const target = addDays(a, t.anchor.offset);
      for (const candidate of [target, addDays(target, 1), addDays(target, -1)]) {
        const notify = addDays(candidate, -notifyOffset(t));
        if (!inWindow(candidate) || notify < input.from) continue;
        if (notifyTaken.has(notify) || targetTaken.has(candidate) || !cooldownOk(t, candidate)) continue;
        place(t, candidate);
        break;
      }
    }
  }

  // ---- 2. Choose active days (error diffusion keeps the rhythm even) -------
  const rate = RATE[input.prefs.cadence];
  const maxRest = MAX_REST[input.prefs.cadence];
  const active: ISODate[] = [];
  let debt = 0.5;
  let restStreak = 0;
  for (let i = 0; i < horizon; i++) {
    const date = addDays(input.from, i);
    const phase = byDate.get(date)?.phase;
    if (targetTaken.has(date)) {
      debt -= 1 - rate * (phase ? INTENSITY[phase] : 1);
      restStreak = 0;
      continue;
    }
    const forced = input.intent === 'trying' && phase === 'ovulatory' && SHARE_ORDER[input.share] >= 1;
    debt += rate * (phase ? INTENSITY[phase] : 1);
    if (forced || debt >= 1 - 1e-9 || restStreak >= maxRest) {
      active.push(date);
      debt = Math.max(debt - 1, -0.5);
      restStreak = 0;
    } else {
      restStreak += 1;
    }
  }

  // ---- 3. Fill active days ---------------------------------------------------
  const pool = library.filter((t) => !t.anchor && eligibleBase(t, input));

  for (const date of active) {
    const phase = byDate.get(date)?.phase;
    const cycle = cycleOf(date);
    const isWeekend = weekend.has(weekday(date));
    const prevKind = [...placed].filter((p) => p.target < date).sort((a, b) => (a.target < b.target ? 1 : -1))[0]
      ?.t.kind;

    const inThisCycle = placed.filter((p) => p.cycle === cycle);
    const bigInSummer = inThisCycle.filter((p) => p.t.big && p.phase === 'ovulatory').length;
    const giftsInSummer = inThisCycle.filter((p) => p.t.kind === 'gift' && p.phase === 'ovulatory').length;
    const bigOutside = inThisCycle.filter((p) => p.t.big && p.phase !== 'ovulatory').length;
    const lastBig = placed
      .filter((p) => p.t.big)
      .map((p) => p.target)
      .sort()
      .reverse()[0];

    const nextMention = openMentions.find((m) => !usedMentions.has(m.id) && diffDays(m.date, date) >= 1);

    const scored: { t: NudgeTemplate; score: number }[] = [];
    for (const t of pool) {
      const a = affinity(t, phase);
      if (a <= 0) continue;
      if (t.weekendOnly && !isWeekend) continue;
      if (t.kind === prevKind) continue;
      if (t.usesMention && !nextMention) continue;
      if (date === input.from && snoozedToday.has(t.id)) continue;
      if (!cooldownOk(t, date)) continue;
      const notify = addDays(date, -notifyOffset(t));
      if (notify < input.from || notifyTaken.has(notify)) continue;
      if (t.big) {
        if (phase === 'ovulatory' && bigInSummer >= 1) continue;
        if (lastBig && Math.abs(diffDays(lastBig, date)) < BIG_SPACING) continue;
      }
      if (t.kind === 'gift' && phase === 'ovulatory' && giftsInSummer >= 1) continue;

      let score = a * loveWeight(t.kind, input.playbook) * learned[t.kind];
      const lastKind = lastKindUse.get(t.kind);
      const kindGap = lastKind ? diffDays(lastKind, date) : 30;
      score *= Math.min(1, 0.55 + 0.08 * Math.max(kindGap, 0));
      if (!lastUse.has(t.id)) score *= 1.15;
      if (t.big && phase !== 'ovulatory' && bigOutside === 0) score *= 1.7;
      if (t.usesMention) score *= 1.5;
      if (t.kind === 'adventure' && isWeekend) score *= 1.3;
      if (input.intent === 'trying' && t.kind === 'romance' && phase === 'ovulatory') score *= 1.3;
      if (input.intent === 'basics' && t.kind === 'romance') score *= 0.6;
      scored.push({ t, score });
    }
    if (scored.length === 0) continue;

    scored.sort((x, y) => y.score - x.score);
    const top = scored.slice(0, 6);
    const rand = seededRandom(input.seed, 'pick', date);
    const idx = sampleIndex(
      top.map((s) => s.score ** 3),
      rand,
    );
    const chosen = top[Math.max(0, idx)]!.t;
    place(chosen, date, chosen.usesMention ? nextMention : undefined);
  }

  // ---- 4. Render -------------------------------------------------------------
  const items = placed
    .map((p): PlannedNudge => {
      const title = fillTokens(p.t.title, input.playbook, p.mention);
      const detail = fillTokens(p.t.detail, input.playbook, p.mention);
      const why = p.t.why ?? (p.phase ? PHASE_COPY[p.phase].read : 'A small thing, done well, on an ordinary day.');
      return {
        key: `${p.t.id}@${p.target}`,
        templateId: p.t.id,
        kind: p.t.kind,
        date: p.notify,
        targetDate: p.target,
        ...(p.phase ? { phase: p.phase } : {}),
        title,
        detail,
        why,
        notifyAt: notifyTime(p.t, input.prefs),
        lockScreen: lockScreenCopy(p.t.kind, title, detail, p.t.minutes, input.prefs.detailedNotifications ?? false),
        ...(p.t.action ? { action: renderAction(p.t, input.playbook) } : {}),
        big: p.t.big ?? false,
        cost: p.t.cost,
        minutes: p.t.minutes,
        ...(p.mention ? { mentionId: p.mention.id } : {}),
      };
    })
    .sort((a, b) => (a.date === b.date ? (a.targetDate < b.targetDate ? -1 : 1) : a.date < b.date ? -1 : 1));

  const restDays: ISODate[] = [];
  for (let i = 0; i < horizon; i++) {
    const d = addDays(input.from, i);
    if (!targetTaken.has(d)) restDays.push(d);
  }
  return { items, restDays };
}

function renderAction(t: NudgeTemplate, playbook: Playbook): PlannedNudge['action'] {
  const a = t.action!;
  switch (a.type) {
    case 'order':
      return { ...a, query: fillTokens(a.query, playbook) };
    case 'reserve':
      return { ...a, query: fillTokens(a.query, playbook) };
    default:
      return a;
  }
}

/** Fraction of big gestures that land in her ovulatory days. The product's core health metric. */
export function summerShareOfBigGestures(items: PlannedNudge[]): number {
  const big = items.filter((i) => i.big);
  if (big.length === 0) return 0;
  return big.filter((i) => i.phase === 'ovulatory').length / big.length;
}

/** The nudge for a given day, if any. */
export function nudgeFor(plan: Plan, date: ISODate): PlannedNudge | undefined {
  return plan.items.find((i) => i.date === date);
}
