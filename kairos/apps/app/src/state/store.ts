import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  localToday,
  type CycleData,
  type HistoryEntry,
  type Intent,
  type ISODate,
  type LHResult,
  type Mention,
  type PartnerPrefs,
  type PartnerSnapshot,
  type Phase,
  type Playbook,
  type ShareLevel,
  type SignalEvent,
  type SignalId,
} from '@kairos/core';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import { DEMO_PLAYBOOK, demoCycleData, demoMentions } from './demo';

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

interface Data {
  role?: Role;
  demo: boolean;
  /** Demo-only time travel, in days from the real today. */
  dayOffset: number;
  onboarded: boolean;

  // Her phone
  cycle: CycleData;
  intent: Intent;
  share: ShareLevel;
  paused: boolean;
  playbook: Playbook;
  signals: SignalEvent[];
  healthSource: 'apple-health' | 'health-connect' | 'manual';

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
  startDemo: (role: Role) => void;
  setRole: (role: Role) => void;
  finishOnboarding: () => void;
  reset: () => void;
  travel: (days: number) => void;

  logPeriodStart: (date: ISODate) => void;
  logPeriodEnd: (date: ISODate) => void;
  logLH: (date: ISODate, result: LHResult) => void;
  logPregnancyTest: (date: ISODate, positive: boolean) => void;
  importCycle: (data: CycleData, source: Data['healthSource']) => void;
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
  demo: false,
  dayOffset: 0,
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

      startDemo: (role) => {
        const today = localToday();
        set({
          ...INITIAL,
          demo: true,
          role,
          onboarded: true,
          cycle: demoCycleData(today),
          intent: 'trying',
          share: 'fertility',
          playbook: DEMO_PLAYBOOK,
          healthSource: 'apple-health',
          hisName: 'Alex',
          pairing: {
            status: 'paired',
            partnerName: role === 'him' ? 'Maya' : 'Alex',
            safety: ['🌸', '🦊', '🍋', '🌙'],
            pairedAt: nowIso(),
            pairId: 'demo',
          },
          mentions: demoMentions(today),
          prefs: { cadence: 'steady', budget: 3, notifyAt: '08:30' },
          calendar: { synced: false },
        });
      },
      setRole: (role) => set({ role }),
      finishOnboarding: () => set({ onboarded: true }),
      reset: () => set({ ...INITIAL }),
      travel: (days) => set({ dayOffset: days }),

      logPeriodStart: (date) =>
        set((s) => ({
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
      name: 'kairos-v1',
      version: 1,
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
