import { localToday, SEASON_PALETTE, type PartnerSnapshot, type SignalEvent } from '@kairos/core';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { configureNotifications, onNudgeResponse, presentSignal, scheduleNudges } from '@/platform/notifications';
import { receive, relayConfigured, send } from '@/platform/relay';
import { updateSeasonWidget } from '@/widgets/season';

import { useKairos } from './kairos';
import { useStore } from './store';

/**
 * Everything that happens without a tap:
 *  - his phone keeps two weeks of nudges scheduled as local notifications;
 *  - notification buttons ("Done", "Tomorrow") are recorded without opening the app;
 *  - her phone publishes an encrypted snapshot whenever it changes;
 *  - his phone collects new snapshots and signals when it comes to the foreground.
 */
export function useBackgroundWork(ready: boolean) {
  const role = useStore((s) => s.role);
  const demo = useStore((s) => s.demo);
  const paired = useStore((s) => s.pairing.status === 'paired');
  const k = useKairos();
  const native = Platform.OS !== 'web';

  const detailed = useStore((s) => s.prefs.detailedNotifications);

  // Home-screen / lock-screen widget (iOS). Codename only; the idea only if he opted in.
  useEffect(() => {
    if (!ready || Platform.OS !== 'ios' || !k.copy || !k.season) return;
    const pal = SEASON_PALETTE[k.season];
    updateSeasonWidget({
      title: k.copy.codename,
      glyph: k.copy.glyph,
      short: k.copy.codename.split(' ').pop()!,
      line: role === 'her' ? k.copy.herRead : k.copy.read.split('. ').pop()!,
      meta: k.cycleDay ? `Day ${k.cycleDay}` : 'Kairos',
      ...(detailed && role === 'him' && k.todayNudge ? { idea: k.todayNudge.title } : {}),
      from: pal.from,
      to: pal.to,
      ink: pal.ink,
    });
  }, [ready, role, detailed, k.copy, k.season, k.cycleDay, k.todayNudge]);

  // His notifications.
  useEffect(() => {
    if (!ready || !native || role !== 'him' || demo) return;
    let cancelled = false;
    configureNotifications()
      .then((ok) => (ok && !cancelled ? scheduleNudges(k.plan.items) : 0))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ready, native, role, demo, k.plan]);

  useEffect(() => {
    if (!native) return;
    return onNudgeResponse((r) => {
      const s = useStore.getState();
      if (r.action === 'done') {
        s.log({
          key: r.key,
          nudgeId: r.templateId,
          kind: r.kind as never,
          date: localToday(),
          outcome: 'done',
          title: r.title,
        });
      } else if (r.action === 'later') {
        s.log({
          key: r.key,
          nudgeId: r.templateId,
          kind: r.kind as never,
          date: localToday(),
          outcome: 'snoozed',
          title: r.title,
        });
      }
    });
  }, [native]);

  // Her phone publishes; debounce so a burst of edits sends one envelope.
  const lastSent = useRef<string>('');
  useEffect(() => {
    if (!ready || demo || role !== 'her' || !paired || !relayConfigured || !k.snapshot) return;
    const { generatedAt: _g, ...stable } = k.snapshot;
    const fingerprint = JSON.stringify(stable);
    if (fingerprint === lastSent.current) return;
    const id = setTimeout(() => {
      lastSent.current = fingerprint;
      send('snapshot', k.snapshot).catch(() => {
        lastSent.current = '';
      });
    }, 1500);
    return () => clearTimeout(id);
  }, [ready, demo, role, paired, k.snapshot]);

  // His phone collects on launch and whenever it returns to the foreground.
  useEffect(() => {
    if (!ready || demo || role !== 'him' || !paired || !relayConfigured) return;
    const pull = async () => {
      const messages = await receive().catch(() => []);
      for (const m of messages) {
        if (m.type === 'snapshot') {
          const snap = m.payload as PartnerSnapshot;
          const before = useStore.getState().snapshot?.signals ?? [];
          useStore.getState().receiveSnapshot(snap);
          const fresh = snap.signals.filter((e: SignalEvent) => !before.some((b) => b.at === e.at));
          if (fresh.length && native) {
            const { respondToSignal } = await import('@kairos/core');
            for (const e of fresh) await presentSignal(respondToSignal(e, snap.playbook)).catch(() => {});
          }
        }
      }
    };
    pull();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && pull());
    const id = setInterval(pull, 60_000);
    return () => {
      sub.remove();
      clearInterval(id);
    };
  }, [ready, demo, role, paired, native]);
}
