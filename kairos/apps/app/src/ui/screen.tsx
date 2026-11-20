import type { Season } from '@kairos/core';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { alpha, MaxWidth, seasonColors, Space, useTheme } from './theme';

/** A full screen: warm background, a wash of the season's colour at the top, one centred column. */
export function Screen({
  children,
  season,
  scroll = true,
  footer,
}: {
  children: ReactNode;
  season?: Season;
  scroll?: boolean;
  /** Pinned to the bottom, above the home indicator. */
  footer?: ReactNode;
}) {
  const { colors, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const glow = season ? seasonColors(season).glow : '#B79BEB';
  const content = (
    <View
      style={[
        styles.content,
        {
          paddingTop: insets.top + Space.m,
          paddingBottom: footer ? Space.l : insets.bottom + Space.xxl,
        },
      ]}>
      {children}
    </View>
  );
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <LinearGradient
        pointerEvents="none"
        colors={[alpha(glow, dark ? 0.24 : 0.3), alpha(glow, 0)]}
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
        <View style={styles.fill}>{content}</View>
      )}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Space.l }]}>
          <View style={styles.footerColumn}>{footer}</View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  fill: { flex: 1, alignItems: 'center' },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 480 },
  scroll: { flexGrow: 1, alignItems: 'center' },
  content: { width: '100%', maxWidth: MaxWidth, paddingHorizontal: Space.xl, flexGrow: 1 },
  footer: { alignItems: 'center', paddingHorizontal: Space.xl, paddingTop: Space.s },
  footerColumn: { width: '100%', maxWidth: MaxWidth, gap: Space.s },
});
