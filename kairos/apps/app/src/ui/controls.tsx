import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { haptic } from '@/platform/haptics';

import { Icon, type IconName } from './icon';
import { T } from './text';
import { alpha, Radius, Space, useTheme } from './theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Pressable that shrinks a touch under the finger, like system controls. */
export function Press({
  children,
  onPress,
  style,
  disabled,
  accessibilityLabel,
  haptics = true,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  accessibilityLabel?: string;
  haptics?: boolean;
}) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPressIn={() => (scale.value = withSpring(0.965, { damping: 18, stiffness: 400 }))}
      onPressOut={() => (scale.value = withSpring(1, { damping: 14, stiffness: 300 }))}
      onPress={() => {
        if (haptics) haptic.tap();
        onPress?.();
      }}
      style={[anim, disabled ? { opacity: 0.4 } : null, style]}>
      {children}
    </AnimatedPressable>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'ghost';

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  accent,
  style,
  disabled,
  compact,
}: {
  label: string;
  onPress?: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  accent?: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { colors, dark } = useTheme();
  const bg =
    kind === 'primary'
      ? (accent ?? colors.text)
      : kind === 'secondary'
        ? dark
          ? 'rgba(255,255,255,0.09)'
          : 'rgba(30,21,25,0.06)'
        : 'transparent';
  const fg = kind === 'primary' ? (accent ? '#1A1214' : colors.inverse) : colors.text;
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      style={[
        styles.button,
        compact ? styles.buttonCompact : null,
        { backgroundColor: bg },
        kind === 'ghost' ? { paddingHorizontal: Space.s } : null,
        style,
      ]}>
      {icon ? <Icon name={icon} size={compact ? 15 : 17} color={fg} /> : null}
      <T
        variant="label"
        color={fg}
        center
        style={{ fontSize: compact ? 14 : 16, lineHeight: compact ? 18 : 20, flexShrink: 1 }}>
        {label}
      </T>
    </Press>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  accent,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  accent?: string;
  icon?: IconName;
}) {
  const { colors, dark } = useTheme();
  const on = accent ?? colors.text;
  return (
    <Press
      onPress={onPress}
      accessibilityLabel={label}
      style={[
        styles.chip,
        {
          backgroundColor: selected
            ? alpha(on.startsWith('#') ? on : '#FFFFFF', dark ? 0.18 : 0.14)
            : dark
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(30,21,25,0.05)',
          borderColor: selected ? alpha(on.startsWith('#') ? on : '#FFFFFF', 0.6) : 'transparent',
        },
      ]}>
      {icon ? <Icon name={icon} size={14} color={selected ? on : colors.textSecondary} /> : null}
      <T variant="label" color={selected ? colors.text : colors.textSecondary}>
        {label}
      </T>
    </Press>
  );
}

/** Segmented control: two to four mutually exclusive options. */
export function Segmented<V extends string>({
  options,
  value,
  onChange,
  accent,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  accent?: string;
}) {
  const { colors, dark } = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: dark ? 'rgba(255,255,255,0.07)' : 'rgba(30,21,25,0.06)' }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Press
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityLabel={o.label}
            style={[
              styles.segment,
              on
                ? {
                    backgroundColor: dark ? 'rgba(255,255,255,0.16)' : '#FFFFFF',
                    borderColor: accent ? alpha(accent, 0.5) : 'transparent',
                  }
                : null,
            ]}>
            <T variant="label" color={on ? colors.text : colors.textSecondary}>
              {o.label}
            </T>
          </Press>
        );
      })}
    </View>
  );
}

/** An on/off switch in the season's colour, looking the same on every platform. */
export function Toggle({
  value,
  onChange,
  label,
  accent,
}: {
  value: boolean;
  onChange: (on: boolean) => void;
  label: string;
  accent: string;
}) {
  const { dark } = useTheme();
  const web = { activeThumbColor: '#FFFFFF' } as object; // react-native-web only
  return (
    <Switch
      value={value}
      onValueChange={(on) => {
        haptic.tap();
        onChange(on);
      }}
      accessibilityLabel={label}
      trackColor={{ false: dark ? 'rgba(255,255,255,0.18)' : 'rgba(30,21,25,0.16)', true: accent }}
      thumbColor="#FFFFFF"
      ios_backgroundColor={dark ? 'rgba(255,255,255,0.18)' : 'rgba(30,21,25,0.16)'}
      {...web}
    />
  );
}

/** A round glass button holding one icon: the only chrome on the main screens. */
export function IconButton({
  icon,
  label,
  onPress,
  size = 40,
  tint,
  text,
}: {
  icon: IconName;
  /** Read by screen readers; never shown. */
  label: string;
  onPress?: () => void;
  size?: number;
  tint?: string;
  /** One character shown instead of the icon, e.g. her initial. */
  text?: string;
}) {
  const { colors, dark } = useTheme();
  return (
    <Press
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tint ? alpha(tint, 0.18) : dark ? 'rgba(255,255,255,0.09)' : 'rgba(30,21,25,0.06)',
      }}>
      {text ? (
        <T variant="title2" style={{ fontSize: size * 0.5, lineHeight: size * 0.62 }}>
          {text}
        </T>
      ) : (
        <Icon name={icon} size={Math.round(size * 0.42)} color={tint ?? colors.text} />
      )}
    </Press>
  );
}

/** One big, tappable choice: an icon, two or three words, and a quieter line under them. */
export function Tile({
  icon,
  title,
  caption,
  onPress,
  accent,
}: {
  icon: IconName;
  title: string;
  caption?: string;
  onPress?: () => void;
  accent: string;
}) {
  const { colors, dark } = useTheme();
  return (
    <Press onPress={onPress} accessibilityLabel={caption ? `${title}. ${caption}` : title}>
      <View
        style={[
          styles.tile,
          { backgroundColor: dark ? 'rgba(255,255,255,0.065)' : 'rgba(255,255,255,0.8)', borderColor: colors.border },
        ]}>
        <View style={[styles.tileIcon, { backgroundColor: alpha(accent, dark ? 0.18 : 0.22) }]}>
          <Icon name={icon} size={24} color={dark ? accent : colors.text} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="headline" style={{ fontSize: 18 }}>
            {title}
          </T>
          {caption ? (
            <T variant="footnote" tone="secondary">
              {caption}
            </T>
          ) : null}
        </View>
        <Icon name="chevron" size={13} color={colors.textTertiary} />
      </View>
    </Press>
  );
}

export function SectionLabel({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionLabel}>
      <T variant="caption" tone="tertiary">
        {children}
      </T>
      {right}
    </View>
  );
}

export function Row({
  icon,
  title,
  subtitle,
  right,
  onPress,
  accent,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  accent?: string;
}) {
  const { colors } = useTheme();
  const body = (
    <View style={styles.row}>
      {icon ? (
        <View style={[styles.rowIcon, { backgroundColor: alpha(accent ?? '#FFFFFF', 0.14) }]}>
          <Icon name={icon} size={16} color={accent ?? colors.text} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="callout" style={{ fontWeight: '500' }}>
          {title}
        </T>
        {subtitle ? (
          <T variant="footnote" tone="secondary">
            {subtitle}
          </T>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron" size={13} color={colors.textTertiary} /> : null)}
    </View>
  );
  return onPress ? <Press onPress={onPress}>{body}</Press> : body;
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginLeft: 52 }} />;
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.xl,
    // So the pill grows around a label that wraps at large text sizes; at normal sizes minHeight decides.
    paddingVertical: Space.m,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.s,
  },
  buttonCompact: { minHeight: 38, paddingHorizontal: Space.l },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  segmented: { flexDirection: 'row', borderRadius: Radius.pill, padding: 3, gap: 3 },
  segment: {
    flex: 1,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Space.xxl,
    marginBottom: Space.s,
    paddingHorizontal: 4,
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.l,
    padding: Space.l,
    minHeight: 84,
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  tileIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.m, paddingVertical: 13, paddingHorizontal: Space.l },
  rowIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
