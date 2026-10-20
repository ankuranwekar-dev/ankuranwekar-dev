/**
 * The partner snapshot: the only thing that ever leaves her phone.
 *
 * Her raw logs (temperatures, LH tests, mucus, notes) never sync anywhere.
 * Her phone runs the forecast and sends him a reduced, end-to-end encrypted
 * snapshot whose detail is capped by the share level she picked. His phone
 * plans nudges from that snapshot alone.
 *
 * Two deliberate behaviours:
 *  - A logged positive pregnancy test pauses sharing. Kairos will never tell
 *    him before she does.
 *  - A late period is shown to him as "any day now", never as "late".
 */

import { addDays, diffDays, type ISODate } from '../dates';
import type { Confidence, Forecast } from '../cycle/forecast';
import type { Phase } from '../cycle/seasons';
import type { SignalEvent } from '../nudges/signals';
import { SHARE_ORDER, type Intent, type Playbook, type ShareLevel, type SharedDay } from '../nudges/types';

export interface PartnerSnapshot {
  v: 1;
  /** ISO datetime the snapshot was made on her phone. */
  generatedAt: string;
  asOf: ISODate;
  intent: Intent;
  share: ShareLevel;
  status: 'ok' | 'paused';
  confidence: Confidence;
  /** Where the current cycle began and how long hers usually run, for drawing the ring. */
  cycle?: { start: ISODate; length: number };
  days: SharedDay[];
  nextPeriod?: { date: ISODate; earliest: ISODate; latest: ISODate };
  /** Only at share level 'fertility'. */
  fertileWindow?: { start: ISODate; end: ISODate; best: ISODate[] };
  playbook: Playbook;
  /** Her recent one-tap signals, newest last. */
  signals: SignalEvent[];
}

export interface SnapshotOptions {
  intent: Intent;
  share: ShareLevel;
  playbook: Playbook;
  signals?: SignalEvent[];
  /** She can pause at any time. */
  paused?: boolean;
  now?: Date;
  lookback?: number;
  horizon?: number;
}

const PERIOD_PHASES: ReadonlySet<Phase> = new Set(['menstrual', 'premenstrual']);

export function buildSnapshot(f: Forecast, opts: SnapshotOptions): PartnerSnapshot {
  const now = opts.now ?? new Date();
  const lookback = opts.lookback ?? 7;
  const horizon = opts.horizon ?? 56;
  const paused = opts.paused || f.status === 'pregnant' || f.status === 'needs-data';
  const base = {
    v: 1 as const,
    generatedAt: now.toISOString(),
    asOf: f.asOf,
    intent: opts.intent,
    share: opts.share,
    confidence: f.confidence,
    playbook: opts.playbook,
    signals: (opts.signals ?? []).slice(-10),
  };
  if (paused) return { ...base, status: 'paused', days: [] };

  const level = SHARE_ORDER[opts.share];
  // Always include the whole current cycle, so his ring can draw it.
  const lookbackFrom = addDays(f.asOf, -lookback);
  const from = f.cycleStart && f.cycleStart < lookbackFrom && diffDays(f.cycleStart, f.asOf) <= 60 ? f.cycleStart : lookbackFrom;
  const to = addDays(f.asOf, horizon);
  const days: SharedDay[] = f.days
    .filter((d) => d.date >= from && d.date <= to)
    .map((d) => {
      const out: SharedDay = { date: d.date, bleeding: round2(d.bleeding) };
      if (level >= 1 || PERIOD_PHASES.has(d.phase)) out.phase = d.phase;
      if (level >= 2) {
        out.fertile = round2(d.fertile);
        out.peak = d.peak;
      }
      return out;
    });

  const snapshot: PartnerSnapshot = { ...base, status: 'ok', days };
  if (f.cycleStart) snapshot.cycle = { start: f.cycleStart, length: Math.round(f.stats.cycleMean) };
  if (f.nextPeriod) {
    // Never "late" on his screen: clamp the window so it starts no earlier than tomorrow.
    const tomorrow = addDays(f.asOf, 1);
    const clampDate = (d: ISODate) => (diffDays(tomorrow, d) < 0 ? tomorrow : d);
    snapshot.nextPeriod = {
      date: clampDate(f.nextPeriod.date),
      earliest: clampDate(f.nextPeriod.earliest),
      latest: clampDate(f.nextPeriod.latest),
    };
  }
  if (level >= 2 && f.fertileWindow) snapshot.fertileWindow = f.fertileWindow;
  return snapshot;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Plain-language list of exactly what he can see, for her "What he sees" screen. */
export function describeShare(share: ShareLevel, intent: Intent): string[] {
  const lines = ['When her period is likely to start, as a range', 'A heads-up in the days before it', 'Your playbook and your signals'];
  if (SHARE_ORDER[share] >= 1) lines.splice(2, 0, 'Which season you are in, every day');
  if (SHARE_ORDER[share] >= 2) {
    lines.splice(3, 0, intent === 'trying' ? 'Your fertile window and best days' : 'Your peak days');
  }
  return lines;
}

export const NEVER_SHARED = [
  'Your temperatures, tests and symptoms',
  'Your notes and moods',
  'A pregnancy test result. That news is yours to tell.',
] as const;
