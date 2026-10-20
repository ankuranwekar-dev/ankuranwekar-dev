import { TabList, TabSlot, Tabs, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKairos } from '@/state/kairos';

import { Glass } from './glass';
import { Icon } from './icon';
import type { TabSpec } from './tab-spec';
import { T } from './text';
import { alpha, Radius, seasonColors, useTheme } from './theme';

/** Web: a floating glass capsule in the style of iOS 26's tab bar. */
export function RoleTabs({ tabs }: { tabs: TabSpec[] }) {
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      {/* Expo Router discovers triggers exactly one level below <TabList asChild>, so they must be Dock's direct children. */}
      <TabList asChild>
        <Dock>
          {tabs.map((t) => (
            <TabTrigger key={t.name} name={t.name} href={t.href as never} asChild>
              <TabButton spec={t} />
            </TabTrigger>
          ))}
        </Dock>
      </TabList>
    </Tabs>
  );
}

/** Ignores the style TabList injects and positions itself as a floating capsule. */
function Dock({ children }: { children?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.dock, { bottom: Math.max(insets.bottom, 14) }]} pointerEvents="box-none">
      <Glass radius={Radius.pill} strong style={styles.bar}>
        <View style={styles.row}>{children}</View>
      </Glass>
    </View>
  );
}

function TabButton({ spec, isFocused, ...props }: TabTriggerSlotProps & { spec: TabSpec }) {
  const { colors } = useTheme();
  const { season } = useKairos();
  const accent = seasonColors(season).glow;
  return (
    <Pressable
      {...(props as PressableProps)}
      accessibilityRole="tab"
      accessibilityLabel={spec.label}
      style={styles.tab}>
      <View style={[styles.pill, isFocused ? { backgroundColor: alpha(accent, 0.18) } : null]}>
        <Icon name={spec.icon} size={20} color={isFocused ? accent : colors.textSecondary} />
        <T
          variant="caption"
          style={{ letterSpacing: 0.2, textTransform: 'none', fontSize: 10.5 }}
          color={isFocused ? colors.text : colors.textSecondary}>
          {spec.label}
        </T>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bar: { minWidth: 280 },
  row: { flexDirection: 'row', padding: 5, gap: 2 },
  tab: { flex: 1 },
  pill: {
    minWidth: 84,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 12,
  },
});
