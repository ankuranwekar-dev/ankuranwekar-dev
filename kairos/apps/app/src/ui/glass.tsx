import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, useTheme } from './theme';

interface GlassProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  tint?: string;
  interactive?: boolean;
  /** Stronger, more opaque material for text-heavy cards. */
  strong?: boolean;
}

const liquid = Platform.OS === 'ios' && isLiquidGlassAvailable();

/**
 * One material, three implementations:
 *  - iOS 26+: real Liquid Glass (UIGlassEffect via expo-glass-effect).
 *  - Older iOS and the web: a frosted blur with a hairline and a top sheen.
 *  - Android: an opaque tonal surface (Material 3 expressive), because
 *    real-time blur on mid-range Android costs more battery than it's worth.
 */
export function Glass({ children, style, radius = Radius.l, tint, interactive, strong }: GlassProps) {
  const { dark, colors } = useTheme();
  const shape = { borderRadius: radius, overflow: 'hidden' as const };

  if (liquid) {
    return (
      <GlassView
        glassEffectStyle="regular"
        tintColor={tint}
        isInteractive={interactive}
        colorScheme={dark ? 'dark' : 'light'}
        style={[shape, style]}>
        {children}
      </GlassView>
    );
  }

  if (Platform.OS === 'android') {
    return (
      <View
        style={[
          shape,
          { backgroundColor: dark ? '#1C1620' : '#FFFFFF', borderWidth: 1, borderColor: colors.border },
          style,
        ]}>
        {children}
      </View>
    );
  }

  return (
    <BlurView
      intensity={strong ? 60 : 40}
      tint={dark ? 'dark' : 'light'}
      style={[
        shape,
        {
          backgroundColor: strong ? colors.cardStrong : colors.card,
          borderWidth: StyleSheet.hairlineWidth * 2,
          borderColor: colors.border,
        },
        style,
      ]}>
      <LinearGradient
        pointerEvents="none"
        colors={[dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0)']}
        style={[StyleSheet.absoluteFill, { height: 60 }]}
      />
      {tint ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: 0.12 }]} />
      ) : null}
      {children}
    </BlurView>
  );
}
