import type { NudgeAction } from '@kairos/core';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

/** Human label for the shortcut button on a nudge card. */
export function actionLabel(a: NudgeAction): string {
  switch (a.type) {
    case 'order':
      if (a.label) return a.label;
      return a.what === 'flowers' ? 'Find a florist' : a.what === 'food' ? 'Order in' : a.what === 'scent' ? 'Reorder' : 'Find nearby';
    case 'reserve':
      return a.label ?? 'Find a table';
    case 'message':
      return 'Text her';
    case 'calendar':
      return 'Block the day';
    case 'timer':
      return `Start ${a.minutes}-min timer`;
  }
}

const maps = (q: string) =>
  Platform.OS === 'ios' ? `https://maps.apple.com/?q=${encodeURIComponent(q)}` : `https://www.google.com/maps/search/${encodeURIComponent(q)}`;

/**
 * Opens the right place for a nudge's shortcut. No partner integrations are
 * assumed; everything degrades to a maps or web search. Nothing about her is
 * ever put in a URL except the playbook words he is already looking at.
 */
export async function runAction(a: NudgeAction, draft?: string): Promise<void> {
  switch (a.type) {
    case 'order':
      await Linking.openURL(a.what === 'scent' ? `https://www.google.com/search?q=${encodeURIComponent(a.query)}` : maps(a.what === 'flowers' ? `florist ${a.query}` : a.query));
      return;
    case 'reserve':
      await Linking.openURL(maps(a.query));
      return;
    case 'message': {
      const body = encodeURIComponent(draft ?? a.drafts[0] ?? '');
      await Linking.openURL(Platform.OS === 'ios' ? `sms:&body=${body}` : `sms:?body=${body}`);
      return;
    }
    case 'calendar':
    case 'timer':
      return;
  }
}
