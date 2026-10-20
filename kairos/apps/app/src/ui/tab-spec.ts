import type { SymbolViewProps } from 'expo-symbols';

type SFName = Extract<SymbolViewProps['name'], string>;
type MaterialName = NonNullable<Extract<SymbolViewProps['name'], object>['android']>;

export const ICON_PAIRS = {
  today: ['sun.horizon.fill', 'wb_twilight'],
  rhythm: ['circle.dashed', 'donut_large'],
  her: ['heart.text.square.fill', 'favorite'],
  signals: ['hand.wave.fill', 'waving_hand'],
  sharing: ['lock.shield.fill', 'shield_lock'],
} as const satisfies Record<string, readonly [SFName, MaterialName]>;

export interface TabSpec {
  name: string;
  href: string;
  label: string;
  icon: keyof typeof ICON_PAIRS;
}
