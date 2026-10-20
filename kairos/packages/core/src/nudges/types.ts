import type { ISODate } from '../dates';
import type { Phase } from '../cycle/seasons';

/**
 * Why the couple uses Kairos. She chooses; it changes what he is told.
 *  - trying:  they are trying to conceive. Fertile days are surfaced, his own prep matters.
 *  - closer:  no pregnancy goal; seasons guide care and romance.
 *  - basics:  she shares only what helps him support her around her period.
 */
export type Intent = 'trying' | 'closer' | 'basics';

/**
 * How much of her cycle she lets him see. Data never leaves her phone at a
 * finer grain than this (see share/snapshot.ts).
 *  - period:    bleeding forecast and premenstrual heads-up only.
 *  - seasons:   all four seasons, no fertility numbers.
 *  - fertility: seasons plus fertile probabilities and best days.
 */
export type ShareLevel = 'period' | 'seasons' | 'fertility';

export const SHARE_ORDER: Record<ShareLevel, number> = { period: 0, seasons: 1, fertility: 2 };

/** The six ingredients of feeling loved, used to weight what he is nudged toward. */
export type LoveDimension = 'presence' | 'words' | 'service' | 'gifts' | 'touch' | 'adventure';

export const LOVE_DIMENSIONS: readonly LoveDimension[] = ['presence', 'words', 'service', 'gifts', 'touch', 'adventure'];

export type NudgeKind =
  | 'presence'
  | 'words'
  | 'service'
  | 'gift'
  | 'touch'
  | 'adventure'
  | 'romance'
  | 'care'
  | 'prep';

/** Her playbook: what she loves, written by her, read by his phone. */
export interface Playbook {
  name: string;
  flowers?: string;
  treat?: string;
  scent?: string;
  drink?: string;
  comfortFood?: string;
  cuisine?: string;
  place?: string;
  music?: string;
  /** 0…1 per dimension. Missing dimensions default to 0.5. */
  loves?: Partial<Record<LoveDimension, number>>;
  /** Tags she never wants (e.g. 'public', 'surprise', 'alcohol', 'flowers-cut'). */
  never?: string[];
  /** Free-text notes she wants him to know ("allergic to lilies"). Shown, never parsed. */
  notes?: string[];
}

/** Something she said that he wants to remember. Captured on his phone. */
export interface Mention {
  id: string;
  text: string;
  date: ISODate;
  /** Set when he has followed up. */
  resolved?: boolean;
}

export type Cadence = 'light' | 'steady' | 'devoted';

export interface PartnerPrefs {
  cadence: Cadence;
  /** Highest spend tier he is comfortable being nudged toward (0 free … 3 splurge). */
  budget: 0 | 1 | 2 | 3;
  /** Local time for the daily nudge, "HH:MM". */
  notifyAt: string;
  /** Show specifics on the lock screen. Off by default. */
  detailedNotifications?: boolean;
  /** Weekend days, 0 = Sunday. Defaults to Saturday and Sunday; Gulf users may prefer Friday–Saturday. */
  weekendDays?: number[];
}

export type NudgeAction =
  | { type: 'order'; what: 'flowers' | 'treat' | 'scent' | 'food' | 'gift'; query: string; label?: string }
  | { type: 'reserve'; query: string; label?: string }
  | { type: 'message'; drafts: string[] }
  | { type: 'calendar'; title: string; minutes: number }
  | { type: 'timer'; minutes: number };

/** Anchors tie a nudge to a moment in her cycle rather than letting the planner place it. */
export type AnchorPoint = 'periodStart' | 'fertileStart' | 'ovulation' | 'lutealStart' | 'premenstrualStart';

export interface NudgeTemplate {
  id: string;
  kind: NudgeKind;
  /** May contain {tokens} filled from the playbook, e.g. "Bring home {flowers}". */
  title: string;
  detail: string;
  /** One short line of reasoning, shown under "Why now". */
  why?: string;
  /** Affinity 0…1 per phase. Missing phases mean "never in this phase". */
  phases: Partial<Record<Phase, number>>;
  intents?: Intent[];
  minShare?: ShareLevel;
  cost: 0 | 1 | 2 | 3;
  minutes: number;
  /** Days of preparation needed before the day it pays off. */
  leadDays?: number;
  /** Playbook fields that must be filled for this nudge to make sense. */
  needs?: (keyof Playbook)[];
  tags?: string[];
  when?: 'morning' | 'midday' | 'evening' | 'any';
  weekendOnly?: boolean;
  /** Minimum days before the same nudge can repeat. Default 21. */
  cooldown?: number;
  /** A big gesture. Never clustered in her ovulatory days (the "never only then" rule). */
  big?: boolean;
  action?: NudgeAction;
  /** Fixed placement relative to a cycle anchor; planner inserts these first. */
  anchor?: { to: AnchorPoint; offset: number };
  /** Requires an open "mention" he captured; {mention} is filled from it. */
  usesMention?: boolean;
}

export type Outcome = 'done' | 'skipped' | 'snoozed' | 'hearted';

export interface HistoryEntry {
  nudgeId: string;
  kind: NudgeKind;
  date: ISODate;
  outcome: Outcome;
}

/** One day of what she shares with him, already reduced to her share level. */
export interface SharedDay {
  date: ISODate;
  /** Undefined on days her share level hides. */
  phase?: Phase;
  /** Present only at share level 'fertility'. */
  fertile?: number;
  peak?: boolean;
  bleeding?: number;
}

export interface PlannedNudge {
  /** Stable id: template id + target date. */
  key: string;
  templateId: string;
  kind: NudgeKind;
  /** The day to notify him. */
  date: ISODate;
  /** The day it is meant to land on (≥ date when there is lead time). */
  targetDate: ISODate;
  phase?: Phase;
  title: string;
  detail: string;
  why: string;
  notifyAt: string;
  lockScreen: { title: string; body: string };
  action?: NudgeAction;
  big: boolean;
  cost: 0 | 1 | 2 | 3;
  minutes: number;
  mentionId?: string;
}
