/**
 * Turns a template into words on his screen: fills {tokens} from her playbook
 * and writes the discreet lock-screen version.
 */

import type { Mention, NudgeKind, NudgeTemplate, Playbook } from './types';

const DEFAULTS: Record<string, string> = {
  flowers: 'flowers',
  treat: 'her favorite treat',
  scent: 'perfume',
  drink: 'coffee',
  comfortFood: 'her comfort food',
  cuisine: 'with something she already loves',
  place: 'your favorite spot',
  music: 'your song',
  mention: 'something last week',
};

const TOKEN_RE = /\{(\w+)\}/g;

export function fillTokens(text: string, playbook: Playbook, mention?: Mention): string {
  const filled = text.replace(TOKEN_RE, (_, key: string) => {
    if (key === 'her') return playbook.name || 'her';
    if (key === 'mention') return mention?.text ?? DEFAULTS.mention!;
    const value = (playbook as unknown as Record<string, unknown>)[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    return DEFAULTS[key] ?? key;
  });
  return filled.charAt(0).toUpperCase() + filled.slice(1);
}

/** Templates whose `needs` are all satisfied by the playbook. */
export function playbookSatisfies(t: NudgeTemplate, playbook: Playbook): boolean {
  return (t.needs ?? []).every((k) => {
    const v = playbook[k];
    return typeof v === 'string' ? v.trim().length > 0 : v !== undefined;
  });
}

/**
 * Lock-screen copy. Default is deliberately vague: his phone may be face-up on
 * a meeting table, and nothing on it should ever reveal her cycle.
 */
const DISCREET: Record<NudgeKind, string> = {
  presence: 'A moment worth making today',
  words: 'Something worth saying today',
  service: 'A small way to help today',
  gift: 'A little idea for today',
  touch: 'Something for this evening',
  adventure: 'An idea worth planning',
  romance: 'Something for this evening',
  care: 'A heads-up for this week',
  prep: 'A note for you',
};

export function effortLabel(minutes: number): string {
  if (minutes <= 2) return 'Takes a minute.';
  if (minutes < 60) return `Takes about ${Math.round(minutes / 5) * 5 || minutes} minutes.`;
  const hours = Math.round(minutes / 30) / 2;
  return hours <= 1 ? 'Takes about an hour.' : `Takes about ${hours} hours.`;
}

export function lockScreenCopy(
  kind: NudgeKind,
  title: string,
  detail: string,
  minutes: number,
  detailed: boolean,
): { title: string; body: string } {
  if (!detailed) return { title: DISCREET[kind], body: effortLabel(minutes) };
  const firstSentence = detail.split(/(?<=[.!?])\s/)[0] ?? detail;
  return { title, body: firstSentence };
}
