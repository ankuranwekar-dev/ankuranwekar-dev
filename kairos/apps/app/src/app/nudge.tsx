import { router, useLocalSearchParams } from 'expo-router';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { actionLabel, runAction } from '@/platform/actions';
import { haptic } from '@/platform/haptics';
import { useKairos } from '@/state/kairos';
import { useStore } from '@/state/store';
import { Button, Press } from '@/ui/controls';
import { Glass } from '@/ui/glass';
import { Icon } from '@/ui/icon';
import { effort, KIND_ICON, KIND_LABEL } from '@/ui/nudge-card';
import { T } from '@/ui/text';
import { alpha, MaxWidth, phaseSeason, Radius, seasonColors, Space, useTheme, ink } from '@/ui/theme';

export default function NudgeSheet() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const k = useKairos();
  const log = useStore((s) => s.log);
  const { colors, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const nudge = k.plan.items.find((i) => i.key === key);

  if (!nudge) {
    return (
      <View style={[styles.root, { paddingTop: Space.xxl }]}>
        <T variant="title2" center>
          This idea has moved on.
        </T>
      </View>
    );
  }

  const season = phaseSeason(nudge.phase);
  const pal = seasonColors(season);
  const when = new Date(`${nudge.targetDate}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  const isToday = nudge.date === k.today;

  return (
    <ScrollView
      contentContainerStyle={[
        styles.root,
        { paddingTop: (Platform.OS === 'ios' ? 0 : insets.top) + Space.xl, paddingBottom: insets.bottom + Space.xxl },
      ]}>
      <View style={styles.column}>
        <View style={styles.top}>
          <Press
            onPress={() => router.back()}
            accessibilityLabel="Close"
            style={[styles.close, { backgroundColor: alpha(colors.text, 0.08) }]}>
            <Icon name="close" size={14} color={colors.text} />
          </Press>
        </View>
        <View style={styles.meta}>
          <View style={[styles.kind, { backgroundColor: alpha(pal.glow, 0.16) }]}>
            <Icon name={KIND_ICON[nudge.kind]} size={12} color={ink(pal.glow, dark)} />
            <T variant="caption" color={ink(pal.glow, dark)} style={{ letterSpacing: 0.8 }}>
              {KIND_LABEL[nudge.kind]}
            </T>
          </View>
          <T variant="footnote" tone="tertiary">
            {effort(nudge.minutes)} · {isToday ? 'today' : when}
          </T>
        </View>

        <T variant="title" style={{ marginTop: Space.l }}>
          {nudge.title}
        </T>
        <T variant="body" tone="secondary" style={{ marginTop: Space.m }}>
          {nudge.detail}
        </T>

        <Glass radius={Radius.l} style={{ padding: Space.l, marginTop: Space.xl, gap: 4 }}>
          <T variant="caption" tone="tertiary">
            Why now
          </T>
          <T variant="callout">{nudge.why}</T>
        </Glass>

        {nudge.action?.type === 'message' ? (
          <View style={{ marginTop: Space.xl, gap: Space.s }}>
            <T variant="caption" tone="tertiary">
              Starting points. Say it your way.
            </T>
            {nudge.action.drafts.map((d) => (
              <Press
                key={d}
                onPress={() => runAction(nudge.action!, d).catch(() => {})}
                accessibilityLabel={`Text: ${d}`}>
                <Glass radius={Radius.l} style={styles.draft}>
                  <T variant="callout" style={{ flex: 1 }}>
                    “{d}”
                  </T>
                  <Icon name="message" size={16} color={ink(pal.glow, dark)} />
                </Glass>
              </Press>
            ))}
          </View>
        ) : nudge.action ? (
          <Button
            label={actionLabel(nudge.action)}
            kind="secondary"
            style={{ marginTop: Space.xl }}
            onPress={() => runAction(nudge.action!).catch(() => {})}
          />
        ) : null}

        {isToday ? (
          <Button
            label="Done"
            icon="check"
            accent={pal.glow}
            style={{ marginTop: Space.xl }}
            onPress={() => {
              haptic.success();
              log({
                key: nudge.key,
                nudgeId: nudge.templateId,
                kind: nudge.kind,
                date: k.today,
                outcome: 'done',
                title: nudge.title,
              });
              router.back();
            }}
          />
        ) : (
          <T variant="footnote" tone="tertiary" center style={{ marginTop: Space.xl, color: colors.textTertiary }}>
            You’ll get a reminder on the day{nudge.date !== nudge.targetDate ? ', with time to prepare' : ''}.
          </T>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', paddingTop: Space.xxl, paddingHorizontal: Space.xl },
  column: { width: '100%', maxWidth: MaxWidth },
  top: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: Space.s },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 26, borderRadius: 13 },
  draft: { flexDirection: 'row', alignItems: 'center', gap: Space.m, padding: Space.l },
});
