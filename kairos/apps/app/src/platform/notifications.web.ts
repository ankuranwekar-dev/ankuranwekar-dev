import type { PlannedNudge, SignalResponse } from '@kairos/core';

/** The web app shows nudges in the page; there is nothing to schedule. */
export const NUDGE_CATEGORY = 'kairos.nudge';
export const SIGNAL_CATEGORY = 'kairos.signal';
export async function configureNotifications(): Promise<boolean> {
  return false;
}
export async function scheduleNudges(_items: PlannedNudge[]): Promise<number> {
  return 0;
}
export async function presentSignal(_r: SignalResponse): Promise<void> {}
export type NudgeResponse = {
  action: 'done' | 'later' | 'open';
  key: string;
  date: string;
  kind: string;
  templateId: string;
  title: string;
};
export function onNudgeResponse(_handler: (r: NudgeResponse) => void): () => void {
  return () => {};
}
