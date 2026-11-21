import type { Data, Store } from './store';

/**
 * What a backup carries: her cycle, what has been done, what he has told Tender, and his settings. Not pairing keys,
 * not anything received from her phone, not this phone's calendar link: those belong to a device, not a person.
 */
export const BACKED_UP = [
  'role',
  'onboarded',
  'cycle',
  'intent',
  'share',
  'paused',
  'playbook',
  'healthSource',
  'hisName',
  'prefs',
  'history',
  'mentions',
  'acknowledged',
] as const satisfies readonly (keyof Data)[];

export type BackupData = Partial<Pick<Data, (typeof BACKED_UP)[number]>>;

export function pickBackup(s: Store): BackupData {
  const out: Record<string, unknown> = {};
  for (const k of BACKED_UP) out[k] = s[k];
  return out as BackupData;
}

/**
 * A short fingerprint of what a backup would carry (cyrb53). Kept on the account after each backup or restore, so the
 * app can tell on its own, even after being closed, whether the backup still matches this phone.
 */
export function fingerprint(d: BackupData): string {
  const s = JSON.stringify(d);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Is there anything on this phone worth losing? */
export function hasLocalData(s: Store): boolean {
  return s.onboarded || s.cycle.periods.length > 0 || s.history.length > 0;
}

/** Two backups are the same if they say the same things; used to skip a pointless upload and a pointless question. */
export function sameData(a: BackupData, b: BackupData): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface Summary {
  periods: number;
  ideas: number;
  name: string;
  /** When it was saved (the backup's own clock), or null for what is on this phone now. */
  savedAt: string | null;
}

/** A few facts about a backup, for asking which one to keep. Computed on the phone, after opening it. */
export function summarise(data: BackupData, savedAt: string | null): Summary {
  return {
    periods: data.cycle?.periods.length ?? 0,
    ideas: (data.history ?? []).filter((h) => h.outcome === 'done' || h.outcome === 'hearted').length,
    name: data.playbook?.name ?? '',
    savedAt,
  };
}
