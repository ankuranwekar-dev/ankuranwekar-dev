import { addDays, localToday, weekdayName } from '@kairos/core';
import { router, usePathname } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '@/state/store';

import { Press } from './controls';
import { Glass } from './glass';
import { Icon } from './icon';
import { T } from './text';
import { Radius, useTheme } from './theme';

/** Height the demo bar adds above screen content. Screens pad by this when the demo is on. */
export const DEMO_BAR_HEIGHT = 46;

/**
 * Demo controls: flip between her phone and his, and move through time to
 * watch seasons change, an LH positive land, and a period arrive. Hidden
 * entirely outside the demo.
 */
export function DemoBar() {
  const demo = useStore((s) => s.demo);
  const role = useStore((s) => s.role);
  const offset = useStore((s) => s.dayOffset);
  const travel = useStore((s) => s.travel);
  const setRole = useStore((s) => s.setRole);
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const { colors } = useTheme();
  const hidden = ['/welcome', '/onboarding', '/nudge', '/settings'].some((p) => path.startsWith(p));
  if (!demo || hidden) return null;

  const date = addDays(localToday(), offset);
  const label = offset === 0 ? 'Today' : `${weekdayName(date).slice(0, 3)} · ${offset > 0 ? '+' : ''}${offset}d`;

  const switchTo = (r: 'him' | 'her') => {
    if (r === role) return;
    setRole(r);
    router.replace(r === 'him' ? '/him' : '/her');
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 6 }]}>
      <Glass radius={Radius.pill} strong style={styles.bar}>
        <View style={styles.inner}>
          <View style={styles.roles}>
            {(['him', 'her'] as const).map((r) => (
              <Press
                key={r}
                onPress={() => switchTo(r)}
                accessibilityLabel={r === 'him' ? 'View his phone' : 'View her phone'}
                style={[styles.role, role === r ? { backgroundColor: colors.text } : null]}>
                <T variant="label" color={role === r ? colors.inverse : colors.textSecondary} style={{ fontSize: 12.5 }}>
                  {r === 'him' ? 'His phone' : 'Her phone'}
                </T>
              </Press>
            ))}
          </View>
          <View style={styles.time}>
            <Press onPress={() => travel(offset - 1)} accessibilityLabel="Previous day" style={styles.step}>
              <Icon name="back" size={13} color={colors.textSecondary} />
            </Press>
            <Press onPress={() => travel(0)} accessibilityLabel="Back to today" haptics={false}>
              <T variant="label" style={{ fontSize: 12.5, minWidth: 72, textAlign: 'center' }} tone="primary">
                {label}
              </T>
            </Press>
            <Press onPress={() => travel(offset + 1)} accessibilityLabel="Next day" style={styles.step}>
              <Icon name="chevron" size={13} color={colors.textSecondary} />
            </Press>
          </View>
        </View>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 50 },
  bar: { height: 38 },
  inner: { flexDirection: 'row', alignItems: 'center', height: 38, paddingHorizontal: 4, gap: 6 },
  roles: { flexDirection: 'row', gap: 2 },
  role: { height: 30, paddingHorizontal: 12, borderRadius: 15, justifyContent: 'center' },
  time: { flexDirection: 'row', alignItems: 'center', paddingRight: 2 },
  step: { width: 28, height: 30, alignItems: 'center', justifyContent: 'center' },
});
