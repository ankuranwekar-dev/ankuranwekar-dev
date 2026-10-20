import {
  addDays,
  buildSnapshot,
  diffDays,
  forecast as runForecast,
  localToday,
  PHASE_COPY,
  planNudges,
  respondToSignal,
  seasonOf,
  type Forecast,
  type ISODate,
  type PartnerSnapshot,
  type Phase,
  type Plan,
  type PlannedNudge,
  type Season,
  type SeasonCopy,
  type SharedDay,
  type SignalEvent,
  type SignalResponse,
} from '@kairos/core';
import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { visibleUntil } from './demo';
import { useStore, type Heart, type Logged } from './store';

export interface ActiveSignal {
  event: SignalEvent;
  response: SignalResponse;
}

export interface Kairos {
  today: ISODate;
  forecast?: Forecast;
  snapshot?: PartnerSnapshot;
  plan: Plan;
  day?: SharedDay;
  phase?: Phase;
  season?: Season;
  copy?: SeasonCopy;
  cycleDay?: number;
  todayNudge?: PlannedNudge;
  doneToday?: Logged;
  upcoming: PlannedNudge[];
  activeSignal?: ActiveSignal;
  recentHeart?: Heart;
  /** Days until her period, as a range, from his point of view. */
  periodIn?: { from: number; to: number; likely: number };
  /** Days until the fertile window opens, if shared and upcoming. */
  summerIn?: number;
}

const SIGNAL_TTL_HOURS = 14;

/** Re-render at local midnight so "today" rolls over without a relaunch. */
function useToday(offset: number): ISODate {
  const [base, setBase] = useState(localToday());
  useEffect(() => {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
    const id = setTimeout(() => setBase(localToday()), midnight.getTime() - now.getTime());
    return () => clearTimeout(id);
  }, [base]);
  return addDays(base, offset);
}

function useKairosCompute(): Kairos {
  const s = useStore();
  const today = useToday(s.demo ? s.dayOffset : 0);

  // Her side (or both sides, in the demo): the full forecast runs on her phone only.
  const forecast = useMemo(() => {
    if (s.role !== 'her' && !s.demo) return undefined;
    const data = s.demo ? visibleUntil(s.cycle, today) : s.cycle;
    if (data.periods.length === 0) return undefined;
    return runForecast(data, { asOf: today, seed: s.pairing.pairId ?? 'kairos', lookback: 45, horizon: 90 });
  }, [s.role, s.demo, s.cycle, today, s.pairing.pairId]);

  const snapshot = useMemo<PartnerSnapshot | undefined>(() => {
    if (forecast) {
      return buildSnapshot(forecast, {
        intent: s.intent,
        share: s.share,
        playbook: s.playbook,
        signals: s.signals,
        paused: s.paused,
        horizon: 63,
      });
    }
    return s.snapshot;
  }, [forecast, s.intent, s.share, s.playbook, s.signals, s.paused, s.snapshot]);

  const plan = useMemo<Plan>(() => {
    if (!snapshot || snapshot.status !== 'ok') return { items: [], restDays: [] };
    return planNudges({
      days: snapshot.days,
      from: today,
      horizon: 28,
      intent: snapshot.intent,
      share: snapshot.share,
      playbook: snapshot.playbook,
      prefs: s.prefs,
      history: s.history,
      mentions: s.mentions,
      seed: s.pairing.pairId ?? 'kairos',
    });
  }, [snapshot, today, s.prefs, s.history, s.mentions, s.pairing.pairId]);

  return useMemo(() => {
    const day = snapshot?.days.find((d) => d.date === today);
    const phase = day?.phase;
    const season = phase ? seasonOf(phase) : undefined;
    const copy = phase ? PHASE_COPY[phase] : undefined;
    const cycleDay = snapshot?.cycle ? diffDays(snapshot.cycle.start, today) + 1 : undefined;

    const doneToday = s.history.find((h) => h.date === today && (h.outcome === 'done' || h.outcome === 'hearted'));
    const todayNudge = plan.items.find((i) => i.date === today);
    const upcoming = plan.items.filter((i) => i.date > today).slice(0, 6);

    const now = Date.now();
    const latest = [...(snapshot?.signals ?? [])]
      .reverse()
      .find((e) => now - Date.parse(e.at) < SIGNAL_TTL_HOURS * 3_600_000);
    const activeSignal =
      latest && !s.acknowledged.includes(latest.at)
        ? { event: latest, response: respondToSignal(latest, snapshot!.playbook) }
        : undefined;

    const recentHeart = [...s.hearts].reverse().find((h) => now - Date.parse(h.at) < 48 * 3_600_000);

    let periodIn: Kairos['periodIn'];
    if (snapshot?.nextPeriod) {
      periodIn = {
        from: diffDays(today, snapshot.nextPeriod.earliest),
        to: diffDays(today, snapshot.nextPeriod.latest),
        likely: diffDays(today, snapshot.nextPeriod.date),
      };
    }
    let summerIn: number | undefined;
    if (snapshot?.fertileWindow) {
      const d = diffDays(today, snapshot.fertileWindow.start);
      if (d > 0) summerIn = d;
    }

    return {
      today,
      ...(forecast ? { forecast } : {}),
      ...(snapshot ? { snapshot } : {}),
      plan,
      ...(day ? { day } : {}),
      ...(phase ? { phase } : {}),
      ...(season ? { season } : {}),
      ...(copy ? { copy } : {}),
      ...(cycleDay ? { cycleDay } : {}),
      ...(todayNudge ? { todayNudge } : {}),
      ...(doneToday ? { doneToday } : {}),
      upcoming,
      ...(activeSignal ? { activeSignal } : {}),
      ...(recentHeart ? { recentHeart } : {}),
      ...(periodIn ? { periodIn } : {}),
      ...(summerIn !== undefined ? { summerIn } : {}),
    };
  }, [today, forecast, snapshot, plan, s.history, s.acknowledged, s.hearts]);
}

const KairosContext = createContext<Kairos | null>(null);

/** Computes forecast → snapshot → plan once for the whole tree. */
export function KairosProvider({ children }: { children: ReactNode }) {
  const value = useKairosCompute();
  return createElement(KairosContext.Provider, { value }, children);
}

export function useKairos(): Kairos {
  const k = useContext(KairosContext);
  if (!k) throw new Error('useKairos must be used inside <KairosProvider>');
  return k;
}

/** "in 3–5 days", "tomorrow or so", "any day now". */
export function rangeLabel(r: { from: number; to: number; likely: number }): string {
  if (r.to <= 1) return 'any day now';
  if (r.from <= 1 && r.to <= 3) return 'in the next few days';
  if (r.from === r.to) return r.from === 1 ? 'tomorrow' : `in ${r.from} days`;
  return `in ${Math.max(r.from, 1)}–${r.to} days`;
}
