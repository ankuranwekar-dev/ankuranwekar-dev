import type { NudgeKind, PlannedNudge, Season } from '@kairos/core';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition, ZoomIn } from 'react-native-reanimated';

import { actionLabel, runAction } from '@/platform/actions';
import { haptic } from '@/platform/haptics';
import type { Logged } from '@/state/store';

import { Button, Press } from './controls';
import { Glass } from './glass';
import { Icon, type IconName } from './icon';
import { T } from './text';
import { alpha, Radius, seasonColors, Space, useTheme, ink } from './theme';

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
        <Glass radius={Radius.xl} tint={pal.glow} style={styles.card}>
          <View style={styles.doneRow}>
            <Animated.View entering={ZoomIn.springify().damping(12)} style={[styles.doneBadge, { backgroundColor: pal.glow }]}>
              <Icon name="check" size={22} color="#1A1214" />
            </Animated.View>
            <View style={{ flex: 1, gap: 3 }}>
              <T variant="headline">Done. She’ll feel it.</T>
              <T variant="footnote" tone="secondary" numberOfLines={2}>
                {done.title}
              </T>
            </View>
            <Press onPress={onUndo} accessibilityLabel="Undo">
              <T variant="label" tone="tertiary">
                Undo
              </T>
            </Press>
          </View>
        </Glass>
      </Animated.View>
    );
  }

  if (!nudge || snoozed) {
    return (
      <Animated.View entering={FadeIn.duration(400)} layout={LinearTransition}>
        <Glass radius={Radius.xl} style={styles.card}>
          <T variant="caption" tone="tertiary">
            Today
          </T>
          <T variant="title2" style={{ marginTop: Space.s }}>
            {snoozed ? 'Nothing for today.' : 'A rest day.'}
          </T>
          <T variant="callout" tone="secondary" style={{ marginTop: Space.xs }}>
            {snoozed
              ? 'Fair enough. Tomorrow’s idea is already lined up.'
              : 'No idea today, on purpose. The small things you do anyway count the most.'}
          </T>
          {snoozed ? (
            <Press onPress={onUndo} style={{ marginTop: Space.m }} accessibilityLabel="Undo">
              <T variant="label" tone="secondary">
                Show it again
              </T>
            </Press>
          ) : null}
        </Glass>
      </Animated.View>
    );
  }

  return (
    <Animated.View key={nudge.key} entering={FadeIn.duration(450)} exiting={FadeOut.duration(150)} layout={LinearTransition}>
      <Glass radius={Radius.xl} strong style={styles.card}>
        <Press haptics={false} onPress={() => router.push({ pathname: '/nudge', params: { key: nudge.key } })} accessibilityLabel={`Open ${nudge.title}`}>
          <View style={styles.meta}>
            <View style={[styles.kind, { backgroundColor: alpha(pal.glow, 0.16) }]}>
              <Icon name={KIND_ICON[nudge.kind]} size={12} color={ink(pal.glow, dark)} />
              <T variant="caption" color={ink(pal.glow, dark)} style={{ letterSpacing: 0.8 }}>
                {KIND_LABEL[nudge.kind]}
              </T>
            </View>
            <View style={styles.effort}>
              <Icon name="timer" size={12} color={colors.textTertiary} />
              <T variant="footnote" tone="tertiary">
                {effort(nudge.minutes)}
              </T>
            </View>
          </View>
          <T variant="title2" style={{ marginTop: Space.m }}>
            {nudge.title}
          </T>
          <T variant="callout" tone="secondary" style={{ marginTop: Space.s }}>
            {nudge.detail}
          </T>
          {nudge.targetDate !== nudge.date ? (
            <T variant="footnote" color={ink(pal.glow, dark)} style={{ marginTop: Space.s }}>
              Set it up today so it lands on {new Date(`${nudge.targetDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' })}.
            </T>
          ) : null}
          <View style={[styles.why, { borderColor: colors.hairline }]}>
            <T variant="footnote" tone="tertiary">
              <T variant="footnote" tone="secondary" style={{ fontWeight: '600' }}>
                Why now{'  '}
              </T>
              {nudge.why}
            </T>
          </View>
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
          {nudge.action ? (
            <Button
              label={actionLabel(nudge.action)}
              kind="secondary"
              style={{ flex: 1.2 }}
              onPress={() => {
                if (nudge.action?.type === 'message') router.push({ pathname: '/nudge', params: { key: nudge.key } });
                else runAction(nudge.action!).catch(() => {});
              }}
            />
          ) : null}
        </View>
        <View style={styles.secondary}>
          <Press onPress={onSwap} style={styles.textButton} accessibilityLabel="Another idea">
            <Icon name="swap" size={13} color={colors.textSecondary} />
            <T variant="label" tone="secondary">
              Another idea
            </T>
          </Press>
          <Press onPress={onSnooze} style={styles.textButton} accessibilityLabel="Not today">
            <Icon name="later" size={13} color={colors.textSecondary} />
            <T variant="label" tone="secondary">
              Not today
            </T>
          </Press>
        </View>
      </Glass>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { padding: Space.xl },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 26, borderRadius: 13 },
  effort: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  why: { marginTop: Space.l, paddingTop: Space.m, borderTopWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: 'row', gap: Space.s, marginTop: Space.l },
  secondary: { flexDirection: 'row', justifyContent: 'center', gap: Space.xxl, marginTop: Space.m },
  textButton: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32 },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: Space.m },
  doneBadge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
