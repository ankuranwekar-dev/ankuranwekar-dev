import type { Season } from '@kairos/core';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { seasonColors } from './theme';

function mix(hex: string, withHex: string, t: number): string {
  const p = (h: string) => {
    const n = parseInt(h.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const a = p(hex);
  const b = p(withHex);
  const c = a.map((v, i) => Math.round(v + (b[i]! - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

interface OrbProps {
  season: Season | undefined;
  size?: number;
  /** Seconds per breath. ~5.5 s is a calm resting rhythm. */
  breath?: number;
  dim?: boolean;
}

/**
 * The orb: her season as light. It breathes slowly (a deliberate, calming
 * rhythm), its aurora drifts, and its colors are the season palette. No
 * numbers, no labels — it should feel like weather, not a dashboard.
 */
export function Orb({ season, size = 240, breath = 5.5, dim }: OrbProps) {
  const reduced = useReducedMotion();
  const c = seasonColors(season);
  const light = mix(c.from, '#FFFFFF', 0.55);
  const t = useSharedValue(0);
  const spin = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    t.value = withRepeat(withTiming(1, { duration: breath * 1000, easing: Easing.inOut(Easing.sin) }), -1, true);
    spin.value = withRepeat(withTiming(1, { duration: 48_000, easing: Easing.linear }), -1, false);
  }, [reduced, breath, t, spin]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: (dim ? 0.35 : 0.65) + 0.3 * t.value,
    transform: [{ scale: 0.94 + 0.1 * t.value }],
  }));
  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.985 + 0.03 * t.value }] }));
  const auroraStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));

  const glow = size * 1.9;
  const r = size / 2;
  const id = `orb-${season ?? 'none'}`;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
      <Animated.View style={[styles.center, { width: glow, height: glow }, glowStyle]}>
        <Svg width={glow} height={glow}>
          <Defs>
            <RadialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={c.glow} stopOpacity={0.55} />
              <Stop offset="0.45" stopColor={c.glow} stopOpacity={0.18} />
              <Stop offset="1" stopColor={c.glow} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={glow / 2} cy={glow / 2} r={glow / 2} fill={`url(#${id}-glow)`} />
        </Svg>
      </Animated.View>

      <Animated.View style={[styles.center, { width: size, height: size }, bodyStyle]}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id={`${id}-body`} cx="38%" cy="32%" r="78%" fx="34%" fy="28%">
              <Stop offset="0" stopColor={light} />
              <Stop offset="0.42" stopColor={c.from} />
              <Stop offset="1" stopColor={c.to} />
            </RadialGradient>
            <RadialGradient id={`${id}-spec`} cx="32%" cy="24%" r="30%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.55} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id={`${id}-rim`} cx="50%" cy="50%" r="50%">
              <Stop offset="0.82" stopColor={c.to} stopOpacity={0} />
              <Stop offset="1" stopColor={mix(c.to, '#000000', 0.35)} stopOpacity={0.45} />
            </RadialGradient>
          </Defs>
          <Circle cx={r} cy={r} r={r} fill={`url(#${id}-body)`} />
          <Circle cx={r} cy={r} r={r} fill={`url(#${id}-rim)`} />
          <Circle cx={r} cy={r} r={r} fill={`url(#${id}-spec)`} />
        </Svg>
      </Animated.View>

      <Animated.View style={[styles.center, { width: size, height: size, opacity: 0.55 }, auroraStyle]}>
        <Svg width={size} height={size}>
          <Defs>
            <ClipPath id={`${id}-clip`}>
              <Circle cx={r} cy={r} r={r - 1} />
            </ClipPath>
            <RadialGradient id={`${id}-aurora`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={mix(c.glow, '#FFFFFF', 0.35)} stopOpacity={0.9} />
              <Stop offset="1" stopColor={c.glow} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse
            clipPath={`url(#${id}-clip)`}
            cx={r * 1.25}
            cy={r * 1.35}
            rx={r * 0.75}
            ry={r * 0.32}
            fill={`url(#${id}-aurora)`}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
