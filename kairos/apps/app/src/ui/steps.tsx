import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInRight, FadeOutLeft } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Press } from './controls';
import { Icon } from './icon';
import { T } from './text';
import { MaxWidth, Space, useTheme } from './theme';

/** Shared chrome for onboarding: progress dots, back, a title, and a pinned footer. */
export function StepFrame({
  step,
  total,
  onBack,
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  step: number;
  total: number;
  onBack?: () => void;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top + Space.m, paddingBottom: insets.bottom + Space.l }]}>
      <View style={styles.column}>
        <View style={styles.top}>
          {onBack ? (
            <Press onPress={onBack} accessibilityLabel="Back" style={styles.back}>
              <Icon name="back" size={18} color={colors.textSecondary} />
            </Press>
          ) : (
            <View style={styles.back} />
          )}
          <View style={styles.dots}>
            {Array.from({ length: total }, (_, i) => (
              <View
                key={i}
                style={[styles.dot, { backgroundColor: i <= step ? colors.text : colors.hairline, width: i === step ? 20 : 6 }]}
              />
            ))}
          </View>
          <View style={styles.back} />
        </View>
        <Animated.View key={step} entering={FadeInRight.duration(320)} exiting={FadeOutLeft.duration(160)} style={styles.body}>
          {eyebrow ? (
            <T variant="caption" tone="tertiary">
              {eyebrow}
            </T>
          ) : null}
          <T variant="title" style={{ marginTop: Space.s }}>
            {title}
          </T>
          {subtitle ? (
            <T variant="callout" tone="secondary" style={{ marginTop: Space.s }}>
              {subtitle}
            </T>
          ) : null}
          <View style={{ marginTop: Space.xxl, flex: 1 }}>{children}</View>
        </Animated.View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: MaxWidth, paddingHorizontal: Space.xl },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44 },
  back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { height: 6, borderRadius: 3 },
  body: { flex: 1, paddingTop: Space.xl },
  footer: { gap: Space.s, paddingTop: Space.l },
});
