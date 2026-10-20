import { NativeTabs } from 'expo-router/native-tabs';

import { useKairos } from '@/state/kairos';

import { ICON_PAIRS, type TabSpec } from './tab-spec';
import { seasonColors, useTheme } from './theme';

/** iOS: the system tab bar (Liquid Glass on iOS 26). Android: Material 3 bottom navigation. */
export function RoleTabs({ tabs }: { tabs: TabSpec[] }) {
  const { colors } = useTheme();
  const { season } = useKairos();
  const accent = seasonColors(season).glow;
  return (
    <NativeTabs
      tintColor={accent}
      iconColor={{ default: colors.textSecondary, selected: accent }}
      minimizeBehavior="onScrollDown">
      {tabs.map((t) => (
        <NativeTabs.Trigger key={t.name} name={t.name}>
          <NativeTabs.Trigger.Label>{t.label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={ICON_PAIRS[t.icon][0]} md={ICON_PAIRS[t.icon][1]} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
