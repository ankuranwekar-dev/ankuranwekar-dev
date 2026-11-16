import type { NudgeKind, PlannedNudge, Season } from '@kairos/core';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, ZoomIn } from 'react-native-reanimated';

import { haptic } from '@/platform/haptics';
import type { Logged } from '@/state/store';

import { Button, IconButton, Press } from './controls';
import { Glass } from './glass';
import { Icon, type IconName } from './icon';
import { T } from './text';
import { ink, Radius, seasonColors, Space, useTheme } from './theme';

export const KIND_ICON: Record<NudgeKind, IconName> = {
  presence: 'eye',
  words: 'quote',
  service: 'check',
  gift: 'bag',
  touch: 'heart',
  adventure: 'sparkles',
  romance: 'flame',
  care: 'drop',
  prep: 'shield',
};

export const KIND_LABEL: Record<NudgeKind, string> = {
  presence: 'Presence',
  words: 'Words',
  service: 'Lighten her load',
  gift: 'A small gift',
  touch: 'Touch',
  adventure: 'Something new',
  romance: 'Romance',
  care: 'Care',
  prep: 'Your part',
};

export function effort(minutes: number): string {
  if (minutes <= 2) return '1 min';
  if (minutes < 60) return `${minutes} min`;
  const h = minutes / 60;
  return `${h % 1 === 0 ? h : h.toFixed(1)} hr`;
}

/** Today's one idea: a title, a line, and Done. Everything else is a tap away. */
export function NudgeCard({
  nudge,
  season,
  done,
  snoozed,
  onDone,
  onSwap,
  onSnooze,
  onUndo,
}: {
  nudge?: PlannedNudge;
  season?: Season;
  done?: Logged;
  snoozed?: boolean;
  onDone: () => void;
  onSwap: () => void;
  onSnooze: () => void;
  onUndo: () => void;
}) {
  const { colors, dark } = useTheme();
  const pal = seasonColors(season);

  if (done) {
    return (
      <Animated.View entering={FadeIn.duration(400)} layout={LinearTransition}>
        <Glass radius={Radius.xl} tint={pal.glow} style={[styles.card, styles.doneRow]}>
          <Animated.View
            entering={ZoomIn.springify().damping(12)}
            style={[styles.doneBadge, { backgroundColor: pal.glow }]}>
            <Icon name="check" size={22} color="#1A1214" />
          </Animated.View>
          <View style={{ flex: 1, gap: 2 }}>
            <T variant="headline">Done.</T>
            <T variant="footnote" tone="secondary" numberOfLines={1}>
              {done.title}
            </T>
          </View>
          <Press onPress={onUndo} accessibilityLabel="Undo">
            <T variant="label" tone="tertiary">
              Undo
            </T>
          </Press>
        </Glass>
      </Animated.View>
    );
  }

  if (!nudge || snoozed) {
    return (
      <Animated.View entering={FadeIn.duration(400)} layout={LinearTransition}>
        <Glass radius={Radius.xl} style={[styles.card, { alignItems: 'center', gap: Space.xs }]}>
          <T variant="title2" center>
            {snoozed ? 'Nothing today.' : 'A rest day.'}
          </T>
          <T variant="callout" tone="secondary" center>
            {snoozed ? 'Tomorrow’s idea is ready.' : 'No idea today, on purpose.'}
          </T>
          {snoozed ? (
            <Press onPress={onUndo} style={{ marginTop: Space.s }} accessibilityLabel="Show it again">
              <T variant="label" tone="tertiary">
                Show it again
              </T>
            </Press>
          ) : null}
        </Glass>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      key={nudge.key}
      entering={FadeIn.duration(450)}
      exiting={FadeOut.duration(150)}
      layout={LinearTransition}>
      <Glass radius={Radius.xl} strong style={styles.card}>
        <Press
          haptics={false}
          onPress={() => router.push({ pathname: '/nudge', params: { key: nudge.key } })}
          accessibilityLabel={`${nudge.title}. More`}>
          <View style={styles.meta}>
            <Icon name={KIND_ICON[nudge.kind]} size={13} color={ink(pal.glow, dark)} />
            <T variant="caption" color={ink(pal.glow, dark)} style={{ letterSpacing: 0.9, flex: 1 }}>
              {KIND_LABEL[nudge.kind]} · {effort(nudge.minutes)}
            </T>
            <Icon name="chevron" size={12} color={colors.textTertiary} />
          </View>
          <T variant="title2" style={{ marginTop: Space.s, fontSize: 28, lineHeight: 32 }}>
            {nudge.title}
          </T>
          <T variant="callout" tone="secondary" numberOfLines={2} style={{ marginTop: Space.s }}>
            {nudge.detail}
          </T>
        </Press>
        <View style={styles.actions}>
          <Button
            label="Done"
            icon="check"
            accent={pal.glow}
            style={{ flex: 1 }}
            onPress={() => {
              haptic.success();
              onDone();
            }}
          />
          <IconButton icon="swap" label="Another idea" size={50} onPress={onSwap} />
          <IconButton icon="later" label="Not today" size={50} onPress={onSnooze} />
        </View>
      </Glass>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { padding: Space.xl },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Space.s, marginTop: Space.l },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: Space.m },
  doneBadge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
