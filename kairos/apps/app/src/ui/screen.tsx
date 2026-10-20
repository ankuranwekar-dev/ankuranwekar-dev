import type { Season } from '@kairos/core';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '@/state/store';

import { DEMO_BAR_HEIGHT } from './demo-bar';
import { alpha, MaxWidth, seasonColors, Space, useTheme } from './theme';

/** Bottom space reserved for the floating tab bar. */
export const TAB_CLEARANCE = Platform.select({ ios: 96, android: 110, default: 120 })!;

export function Screen({
  children,
  season,
  scroll = true,
  tabs = true,
  padTop = true,
}: {
  children: ReactNode;
  season?: Season;
  scroll?: boolean;
  tabs?: boolean;
  padTop?: boolean;
}) {
  const { colors, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const demo = useStore((s) => s.demo);
  const glow = season ? seasonColors(season).glow : '#B79BEB';
  const content = (
    <View
      style={[
        styles.content,
        { paddingTop: padTop ? insets.top + Space.l + (demo ? DEMO_BAR_HEIGHT : 0) : 0, paddingBottom: (tabs ? TAB_CLEARANCE : Space.xxl) + insets.bottom },
      ]}>
      {children}
    </View>
  );
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <LinearGradient
        pointerEvents="none"
        colors={[alpha(glow, dark ? 0.22 : 0.28), alpha(glow, 0)]}
        style={styles.glow}
      />
      {scroll ? (
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 460 },
  scroll: { flexGrow: 1, alignItems: 'center' },
  content: { width: '100%', maxWidth: MaxWidth, paddingHorizontal: Space.xl, flexGrow: 1 },
});
