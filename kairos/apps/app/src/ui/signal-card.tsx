import type { NudgeAction, Season } from '@kairos/core';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';

import { actionLabel, runAction } from '@/platform/actions';
import { haptic } from '@/platform/haptics';
import type { ActiveSignal } from '@/state/kairos';

import { Button } from './controls';
import { Icon, SIGNAL_ICON } from './icon';
import { Glass } from './glass';
import { T } from './text';
import { alpha, Radius, seasonColors, Space, useTheme, ink } from './theme';

function ago(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return `${h} hr ago`;
}

/** Her one-tap signal, as it lands on his Today screen. It outranks everything else. */
export function SignalCard({
  signal,
  name,
  season,
  onAck,
}: {
  signal: ActiveSignal;
  name: string;
  season?: Season;
  onAck: () => void;
}) {
  const { colors, dark } = useTheme();
  const pal = seasonColors(season);
  const action: NudgeAction | undefined = signal.response.action;
  return (
    <Animated.View entering={FadeInDown.springify().damping(16)} exiting={FadeOut.duration(200)}>
      <Glass
        radius={Radius.xl}
        tint={pal.glow}
        strong
        style={[styles.card, { borderColor: alpha(pal.glow, 0.55), borderWidth: 1 }]}>
        <View style={styles.header}>
          <View style={[styles.glyph, { backgroundColor: alpha(pal.glow, 0.22) }]}>
            <Icon name={SIGNAL_ICON[signal.response.signal.id] ?? 'heart'} size={20} color={ink(pal.glow, dark)} />
          </View>
          <View style={{ flex: 1 }}>
            <T variant="caption" color={ink(pal.glow, dark)}>
              From {name}
            </T>
            <T variant="footnote" tone="tertiary">
              {signal.response.signal.label} · {ago(signal.event.at)}
            </T>
          </View>
        </View>
        <T variant="title2" style={{ marginTop: Space.m }}>
          {signal.response.title}
        </T>
        <T variant="callout" tone="secondary" style={{ marginTop: Space.xs }}>
          {signal.response.detail}
        </T>
        <View style={styles.actions}>
          <Button
            label="On it"
            accent={pal.glow}
            style={{ flex: 1 }}
            onPress={() => {
              haptic.success();
              onAck();
            }}
          />
          {action ? (
            <Button
              label={actionLabel(action)}
              kind="secondary"
              style={{ flex: 1 }}
              onPress={() => runAction(action).catch(() => {})}
            />
          ) : null}
        </View>
        {signal.response.quietUntil ? (
          <T variant="footnote" tone="tertiary" style={{ marginTop: Space.m, color: colors.textTertiary }}>
            Other ideas are paused for a while.
          </T>
        ) : null}
      </Glass>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { padding: Space.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: Space.m },
  glyph: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: Space.s, marginTop: Space.l },
});
