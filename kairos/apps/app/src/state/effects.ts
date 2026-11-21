import { localToday, SEASON_PALETTE, type PartnerSnapshot, type SignalEvent } from '@kairos/core';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { configureNotifications, onNudgeResponse, presentSignal, scheduleNudges } from '@/platform/notifications';
import { receive, relayConfigured, send } from '@/platform/relay';
import { updateSeasonWidget } from '@/widgets/season';

import { useAutoBackup } from './account';
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
  useAutoBackup(ready);
  const role = useStore((s) => s.role);
  const onboarded = useStore((s) => s.onboarded);
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
      meta: k.cycleDay ? `Day ${k.cycleDay}` : 'Tender',
      ...(detailed && role === 'him' && k.todayNudge ? { idea: k.todayNudge.title } : {}),
      from: pal.from,
      to: pal.to,
      ink: pal.ink,
    });
  }, [ready, role, detailed, k.copy, k.season, k.cycleDay, k.todayNudge]);

  // His notifications. Only once setup is finished: choosing "I'm her partner" sets the role straight away,
  // and without this check the system permission prompt appeared on the setup screen, before he had even
  // picked a date (finishing setup asks for it, as the runbook says).
  useEffect(() => {
    if (!ready || !native || role !== 'him' || !onboarded) return;
    let cancelled = false;
    // Not at the instant setup finishes. The notification module returns its results from a background
    // thread, and on Xcode 26.0 with Expo SDK 58 that raced with JavaScript running in Hermes: finishing
    // setup (navigating and rendering Today at the same moment) crashed the app. Waiting for the transition
    // to end and the JS thread to go quiet avoids the overlap.
    let idle: number | undefined;
    const timer = setTimeout(() => {
      idle = requestIdleCallback(
        () => {
          if (cancelled) return;
          configureNotifications(false)
            .then((ok) => (ok && !cancelled ? scheduleNudges(k.plan.items) : 0))
            .catch(() => {});
        },
        { timeout: 3000 },
      );
    }, 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (idle !== undefined) cancelIdleCallback(idle);
    };
  }, [ready, native, role, onboarded, k.plan]);

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
    if (!ready || role !== 'her' || !paired || !relayConfigured || !k.snapshot) return;
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
  }, [ready, role, paired, k.snapshot]);

  // His phone collects on launch and whenever it returns to the foreground.
  useEffect(() => {
    if (!ready || role !== 'him' || !paired || !relayConfigured) return;
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
  }, [ready, role, paired, native]);
}
