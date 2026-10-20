/**
 * Signals: one tap from her, one clear prompt for him.
 *
 * The calendar predicts; signals confirm. A season is an average, and averages
 * are wrong about any particular Tuesday. When she taps "Rough day", that beats
 * whatever the forecast said, so a signal overrides today's planned nudge and,
 * for some signals, quiets everything else for a while.
 */

import type { NudgeAction, NudgeKind, Playbook } from './types';
import { fillTokens } from './render';

export type SignalId =
  | 'hold-me'
  | 'space'
  | 'craving'
  | 'rough-day'
  | 'cramps'
  | 'feeling-great'
  | 'take-me-out'
  | 'come-home';

export interface SignalDef {
  id: SignalId;
  /** Her button. Short, first person. */
  label: string;
  glyph: string;
  /** What lands on his phone. */
  title: string;
  detail: string;
  kind: NudgeKind;
  /** Lock-screen line. Discreet but warm: these are real-time and he should act. */
  lockScreen: string;
  /** Hours during which regular nudges are held back. */
  quietHours?: number;
  action?: NudgeAction;
  /** Accepts a short free-text note (e.g. what she's craving). */
  takesNote?: boolean;
}

export const SIGNALS: readonly SignalDef[] = [
  {
    id: 'hold-me',
    label: 'Hold me',
    glyph: '◠',
    title: 'She could use a long hug',
    detail: 'Find her in the next hour. No questions needed; just hold on a little longer than usual.',
    kind: 'touch',
    lockScreen: 'She’d love a hug.',
  },
  {
    id: 'space',
    label: 'Need space',
    glyph: '◌',
    title: 'She needs a little space tonight',
    detail: 'Give it warmly: "Take your time. I’m here whenever you want me." Then handle dinner and let her be.',
    kind: 'service',
    lockScreen: 'A quiet evening would help her.',
    quietHours: 18,
  },
  {
    id: 'craving',
    label: 'Craving…',
    glyph: '✦',
    title: 'She’s craving {note}',
    detail: 'You know what to do. Bonus points if it arrives before she asks again.',
    kind: 'gift',
    lockScreen: 'She’s craving something. You can fix this.',
    takesNote: true,
    action: { type: 'order', what: 'treat', query: '{note}' },
  },
  {
    id: 'rough-day',
    label: 'Rough day',
    glyph: '☁︎',
    title: 'Rough day for her',
    detail:
      'Take one thing off her plate tonight, then ask: "Do you want to vent, or do you want to be distracted?" Do whichever she picks.',
    kind: 'presence',
    lockScreen: 'Today was a hard one for her.',
    quietHours: 12,
    action: {
      type: 'message',
      drafts: [
        'Heard today was rough. Dinner’s handled. Want to vent or be distracted?',
        'I’m on my way. Anything you need?',
      ],
    },
  },
  {
    id: 'cramps',
    label: 'Cramps',
    glyph: '∿',
    title: 'She’s in pain today',
    detail: 'Heat pad, painkillers, a hot drink and quiet. Cancel anything that can be cancelled.',
    kind: 'care',
    lockScreen: 'She’s not feeling well. Go gentle today.',
    quietHours: 24,
  },
  {
    id: 'feeling-great',
    label: 'Feeling great',
    glyph: '☀︎',
    title: 'She’s in a great mood',
    detail: 'Match the energy. Suggest going out tonight, or call her just to hear it.',
    kind: 'adventure',
    lockScreen: 'Good news: she’s having a great day.',
  },
  {
    id: 'take-me-out',
    label: 'Take me out',
    glyph: '✧',
    title: 'She wants to go out',
    detail: 'Book somewhere for tonight or tomorrow and tell her the time. Don’t make her choose.',
    kind: 'adventure',
    lockScreen: 'She’s up for a night out.',
    action: { type: 'reserve', query: '{cuisine} restaurant' },
  },
  {
    id: 'come-home',
    label: 'Home early',
    glyph: '♡',
    title: 'She’d love you home early tonight',
    detail: 'Wrap up early if you possibly can. Bring nothing but yourself.',
    kind: 'romance',
    lockScreen: 'She’d love you home early tonight.',
  },
];

export interface SignalEvent {
  id: SignalId;
  /** ISO datetime. */
  at: string;
  note?: string;
}

export interface SignalResponse {
  signal: SignalDef;
  title: string;
  detail: string;
  lockScreen: { title: string; body: string };
  action?: NudgeAction;
  /** Until when regular nudges are held, ISO datetime, if any. */
  quietUntil?: string;
}

export function signalDef(id: SignalId): SignalDef {
  const d = SIGNALS.find((s) => s.id === id);
  if (!d) throw new Error(`Unknown signal ${id}`);
  return d;
}

export function respondToSignal(event: SignalEvent, playbook: Playbook): SignalResponse {
  const def = signalDef(event.id);
  const note = event.note?.trim() || (event.id === 'craving' ? playbook.treat || 'something sweet' : '');
  const fill = (s: string) => fillTokens(s.replace(/\{note\}/g, note), playbook);
  let action: NudgeAction | undefined;
  if (def.action) {
    action =
      def.action.type === 'order' || def.action.type === 'reserve'
        ? { ...def.action, query: fill(def.action.query) }
        : def.action;
  }
  const name = playbook.name || 'Her';
  return {
    signal: def,
    title: fill(def.title),
    detail: fill(def.detail),
    lockScreen: { title: name, body: def.lockScreen },
    ...(action ? { action } : {}),
    ...(def.quietHours
      ? { quietUntil: new Date(Date.parse(event.at) + def.quietHours * 3_600_000).toISOString() }
      : {}),
  };
}
