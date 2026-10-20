import type { PlannedNudge, SignalResponse } from '@kairos/core';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Local notifications for his nudges.
 *
 * Nudges are planned on his phone from the encrypted snapshot, so they are
 * scheduled *locally*: no server ever composes or sees them. Only her
 * real-time signals need a push, and those arrive as encrypted silent pushes
 * that the app decrypts before showing anything (see docs/PRIVACY.md).
 */

export const NUDGE_CATEGORY = 'kairos.nudge';
export const SIGNAL_CATEGORY = 'kairos.signal';
const HORIZON_DAYS = 14;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function configureNotifications(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('nudges', {
      name: 'Daily ideas',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 40],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
    await Notifications.setNotificationChannelAsync('signals', {
      name: 'From her',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 30, 60, 30],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  }
  await Notifications.setNotificationCategoryAsync(NUDGE_CATEGORY, [
    { identifier: 'done', buttonTitle: 'Done', options: { opensAppToForeground: false } },
    { identifier: 'later', buttonTitle: 'Tomorrow', options: { opensAppToForeground: false } },
  ]);
  await Notifications.setNotificationCategoryAsync(SIGNAL_CATEGORY, [
    { identifier: 'on-it', buttonTitle: 'On it', options: { opensAppToForeground: false } },
  ]);
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: false, allowBadge: false, provideAppNotificationSettings: true },
  });
  return asked.granted;
}

function at(date: string, hhmm: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = hhmm.split(':').map(Number) as [number, number];
  return new Date(y, m - 1, d, hh, mm, 0);
}

/** Replace every scheduled nudge with the current plan (next two weeks). */
export async function scheduleNudges(items: PlannedNudge[], now = new Date()): Promise<number> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.content.categoryIdentifier === NUDGE_CATEGORY)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  const horizon = now.getTime() + HORIZON_DAYS * 86_400_000;
  let count = 0;
  for (const item of items) {
    const when = at(item.date, item.notifyAt);
    if (when.getTime() <= now.getTime() || when.getTime() > horizon) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: `nudge:${item.key}`,
      content: {
        title: item.lockScreen.title,
        body: item.lockScreen.body,
        categoryIdentifier: NUDGE_CATEGORY,
        data: { key: item.key, date: item.date, kind: item.kind, templateId: item.templateId, title: item.title },
        interruptionLevel: 'passive',
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: 'nudges' },
    });
    count++;
  }
  return count;
}

/** Shown immediately when one of her signals arrives (after decryption). */
export async function presentSignal(r: SignalResponse): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: r.lockScreen.title,
      body: r.lockScreen.body,
      categoryIdentifier: SIGNAL_CATEGORY,
      data: { signal: r.signal.id },
      interruptionLevel: 'timeSensitive',
    },
    trigger: Platform.OS === 'android' ? { channelId: 'signals' } : null,
  });
}

export type NudgeResponse = {
  action: 'done' | 'later' | 'open';
  key: string;
  date: string;
  kind: string;
  templateId: string;
  title: string;
};

export function onNudgeResponse(handler: (r: NudgeResponse) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((res) => {
    const data = res.notification.request.content.data as Partial<NudgeResponse> | undefined;
    if (!data?.key) return;
    const action = res.actionIdentifier === 'done' ? 'done' : res.actionIdentifier === 'later' ? 'later' : 'open';
    handler({
      action,
      key: data.key,
      date: data.date!,
      kind: data.kind!,
      templateId: data.templateId!,
      title: data.title!,
    });
  });
  return () => sub.remove();
}
