import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addDays,
  localToday,
  mergePeriods,
  type CycleData,
  type HistoryEntry,
  type Intent,
  type ISODate,
  type LHResult,
  type Mention,
  type PartnerPrefs,
  type PartnerSnapshot,
  type PeriodLog,
  type Phase,
  type Playbook,
  type ShareLevel,
  type SignalEvent,
  type SignalId,
} from '@kairos/core';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

export type Role = 'him' | 'her';

/** A history entry that remembers what he actually saw, so "done" cards survive a re-plan. */
export interface Logged extends HistoryEntry {
  key: string;
  title: string;
}

export interface Heart {
  at: string;
  /** Free text from her, optional. */
  note?: string;
}

export interface Pairing {
  status: 'none' | 'inviting' | 'paired';
  invite?: string;
  pairId?: string;
  safety?: string[];
  partnerName?: string;
  pairedAt?: string;
}

/** A signed-in person: Apple's identifier for them, and where their backup stands. */
export interface Account {
  user: string;
  since: string;
  lastBackupAt?: string;
  /** The server's version of the backup this phone last wrote or restored, for the next write to build on. */
  version?: number;
  /** Another phone has backed up since; automatic backups wait until the person chooses which to keep. */
  conflict?: boolean;
}

export interface Data {
  role?: Role;
  account?: Account;
  onboarded: boolean;

  // Her phone
  cycle: CycleData;
  intent: Intent;
  share: ShareLevel;
  paused: boolean;
  playbook: Playbook;
  signals: SignalEvent[];
  healthSource: 'apple-health' | 'health-connect' | 'screenshot' | 'manual';
  /**
   * On his phone without hers ("solo"): he said her period has not started yet, so Tender stops
   * assuming it has until this day.
   */
  notYetUntil?: ISODate;

  // Shared
  pairing: Pairing;
  hearts: Heart[];

  // His phone
  hisName: string;
  prefs: PartnerPrefs;
  history: Logged[];
  mentions: Mention[];
  acknowledged: string[];
  calendar: { synced: boolean; lastSync?: string; codenames?: Partial<Record<Phase, string>> };
  snapshot?: PartnerSnapshot;
}

interface Actions {
  setRole: (role: Role) => void;
  finishOnboarding: () => void;
  setAccount: (account: Account | undefined) => void;
  patchAccount: (patch: Partial<Account>) => void;
  /** Replace what a backup carries (see state/backup-data.ts) with what it held. */
  restore: (data: Partial<Data>) => void;
  reset: () => void;

  logPeriodStart: (date: ISODate) => void;
  logPeriodEnd: (date: ISODate) => void;
  logLH: (date: ISODate, result: LHResult) => void;
  logPregnancyTest: (date: ISODate, positive: boolean) => void;
  importCycle: (data: CycleData, source: Data['healthSource']) => void;
  /** Adds periods read from a screenshot or picked by hand, keeping everything already known. */
  addPeriods: (periods: PeriodLog[], source: Data['healthSource'], cycleLength?: number) => void;
  /** He confirms the starts Tender had assumed. */
  confirmPeriods: (starts: ISODate[]) => void;
  notYet: () => void;
  setStatedCycle: (cycleLength: number, lastStart: ISODate) => void;
  setIntent: (intent: Intent) => void;
  setShare: (share: ShareLevel) => void;
  setPaused: (paused: boolean) => void;
  updatePlaybook: (patch: Partial<Playbook>) => void;
  sendSignal: (id: SignalId, note?: string) => void;
  sendHeart: (note?: string) => void;

  setPairing: (p: Pairing) => void;
  setHisName: (name: string) => void;
  updatePrefs: (patch: Partial<PartnerPrefs>) => void;
  log: (entry: Logged) => void;
  undoLog: (key: string, date: ISODate) => void;
  addMention: (text: string, date: ISODate) => void;
  resolveMention: (id: string) => void;
  acknowledge: (signalAt: string) => void;
  setCalendar: (c: Data['calendar']) => void;
  receiveSnapshot: (s: PartnerSnapshot) => void;
}

export type Store = Data & Actions;

const INITIAL: Data = {
  onboarded: false,
  cycle: { periods: [] },
  intent: 'closer',
  share: 'seasons',
  paused: false,
  playbook: { name: '' },
  signals: [],
  healthSource: 'manual',
  pairing: { status: 'none' },
  hearts: [],
  hisName: '',
  prefs: { cadence: 'steady', budget: 2, notifyAt: '08:30' },
  history: [],
  mentions: [],
  acknowledged: [],
  calendar: { synced: false },
};

/** Storage that never throws: private browsing, sandboxed iframes and full disks all degrade to memory. */
const memory = new Map<string, string>();
const safeStorage: StateStorage = {
  getItem: async (k) => {
    try {
      return (await AsyncStorage.getItem(k)) ?? memory.get(k) ?? null;
    } catch {
      return memory.get(k) ?? null;
    }
  },
  setItem: async (k, v) => {
    memory.set(k, v);
    try {
      await AsyncStorage.setItem(k, v);
    } catch {
      /* memory only */
    }
  },
  removeItem: async (k) => {
    memory.delete(k);
    try {
      await AsyncStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

const nowIso = () => new Date().toISOString();

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...INITIAL,

      setRole: (role) => set({ role }),
      finishOnboarding: () => set({ onboarded: true }),
      setAccount: (account) => set({ account }),
      patchAccount: (patch) => set((s) => (s.account ? { account: { ...s.account, ...patch } } : {})),
      restore: (data) => set({ ...data }),
      // `account` is not in INITIAL, so it has to be cleared by name: Start over signs out as well as erasing.
      reset: () => set({ ...INITIAL, account: undefined }),

      logPeriodStart: (date) =>
        set((s) => ({
          notYetUntil: undefined,
          cycle: { ...s.cycle, periods: [...s.cycle.periods.filter((p) => p.start !== date), { start: date }] },
        })),
      logPeriodEnd: (date) =>
        set((s) => {
          const periods = [...s.cycle.periods].sort((a, b) => (a.start < b.start ? -1 : 1));
          const last = periods.filter((p) => p.start <= date).pop();
          if (!last) return {};
          return { cycle: { ...s.cycle, periods: periods.map((p) => (p === last ? { ...p, end: date } : p)) } };
        }),
      logLH: (date, result) =>
        set((s) => ({
          cycle: { ...s.cycle, lhTests: [...(s.cycle.lhTests ?? []).filter((t) => t.date !== date), { date, result }] },
        })),
      logPregnancyTest: (date, positive) =>
        set((s) => ({
          cycle: { ...s.cycle, pregnancyTests: [...(s.cycle.pregnancyTests ?? []), { date, positive }] },
        })),
      importCycle: (data, source) => set({ cycle: data, healthSource: source }),
      addPeriods: (periods, source, cycleLength) =>
        set((s) => ({
          healthSource: source,
          notYetUntil: undefined,
          cycle: {
            ...s.cycle,
            periods: mergePeriods(s.cycle.periods, periods),
            ...(cycleLength ? { statedCycleLength: cycleLength } : {}),
          },
        })),
      confirmPeriods: (starts) =>
        set((s) => ({
          notYetUntil: undefined,
          cycle: {
            ...s.cycle,
            periods: mergePeriods(
              s.cycle.periods,
              starts.map((start) => ({ start })),
            ),
          },
        })),
      notYet: () => set({ notYetUntil: addDays(localToday(), 3) }),
      setStatedCycle: (cycleLength, lastStart) =>
        set((s) => ({
          cycle: {
            ...s.cycle,
            statedCycleLength: cycleLength,
            periods: s.cycle.periods.some((p) => p.start === lastStart)
              ? s.cycle.periods
              : [...s.cycle.periods, { start: lastStart }],
          },
        })),
      setIntent: (intent) =>
        set({
          intent,
          share:
            intent === 'trying'
              ? 'fertility'
              : intent === 'basics'
                ? 'period'
                : get().share === 'period'
                  ? 'seasons'
                  : get().share,
        }),
      setShare: (share) => set({ share }),
      setPaused: (paused) => set({ paused }),
      updatePlaybook: (patch) => set((s) => ({ playbook: { ...s.playbook, ...patch } })),
      sendSignal: (id, note) =>
        set((s) => ({ signals: [...s.signals.slice(-19), { id, at: nowIso(), ...(note ? { note } : {}) }] })),
      sendHeart: (note) =>
        set((s) => ({ hearts: [...s.hearts.slice(-49), { at: nowIso(), ...(note ? { note } : {}) }] })),

      setPairing: (pairing) => set({ pairing }),
      setHisName: (hisName) => set({ hisName }),
      updatePrefs: (patch) => set((s) => ({ prefs: { ...s.prefs, ...patch } })),
      log: (entry) =>
        set((s) => ({
          history: [...s.history.filter((h) => !(h.key === entry.key && h.date === entry.date)), entry].slice(-400),
        })),
      undoLog: (key, date) => set((s) => ({ history: s.history.filter((h) => !(h.key === key && h.date === date)) })),
      addMention: (text, date) =>
        set((s) => ({ mentions: [...s.mentions, { id: `m-${Date.now().toString(36)}`, text: text.trim(), date }] })),
      resolveMention: (id) =>
        set((s) => ({ mentions: s.mentions.map((m) => (m.id === id ? { ...m, resolved: true } : m)) })),
      acknowledge: (at) => set((s) => ({ acknowledged: [...s.acknowledged.slice(-49), at] })),
      setCalendar: (calendar) => set({ calendar }),
      receiveSnapshot: (snapshot) => set({ snapshot }),
    }),
    {
      // A build made for developer checks (EXPO_PUBLIC_DEV_READ=1) keeps its own data, so driving it with links can
      // never touch the data of a real install on the same phone.
      name: process.env.EXPO_PUBLIC_DEV_READ === '1' ? 'kairos-v1-dev' : 'kairos-v1',
      version: 3,
      // v2 added screenshot import and solo mode; every v1 field is unchanged. v3 removed the demo: a phone that was
      // showing the simulated couple starts clean rather than keeping Maya's cycle as if it were real.
      migrate: (state) => {
        const old = state as Partial<Store> & { demo?: boolean; dayOffset?: number };
        if (old.demo) return { ...INITIAL } as Store;
        const { demo: _demo, dayOffset: _offset, ...rest } = old;
        return rest as Store;
      },
      storage: createJSONStorage(() => safeStorage),
    },
  ),
);

export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useStore.persist.hasHydrated());
  useEffect(() => {
    const unsub = useStore.persist.onFinishHydration(() => setHydrated(true));
    setHydrated(useStore.persist.hasHydrated());
    return unsub;
  }, []);
  return hydrated;
}
