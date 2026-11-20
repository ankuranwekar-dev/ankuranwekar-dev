import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { actionLabel, runAction } from '@/platform/actions';
import { DEV_READ } from '@/platform/dev';
import { haptic } from '@/platform/haptics';
import { useKairos } from '@/state/kairos';
import { useStore } from '@/state/store';
import { Button, Press } from '@/ui/controls';
import { Glass } from '@/ui/glass';
import { Icon } from '@/ui/icon';
import { effort, KIND_ICON, KIND_LABEL } from '@/ui/nudge-card';
import { Sheet } from '@/ui/sheet';
import { T } from '@/ui/text';
import { ink, phaseSeason, Radius, seasonColors, Space, useTheme } from '@/ui/theme';

export default function NudgeSheet() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const k = useKairos();
  const log = useStore((s) => s.log);
  const { colors, dark } = useTheme();
  // Developer check only: key=first opens today's idea (or the first one), so the sheet can be captured on a device.
  const nudge =
    DEV_READ && key === 'first'
      ? (k.plan.items.find((i) => i.date === k.today) ?? k.plan.items[0])
      : k.plan.items.find((i) => i.key === key);

  if (!nudge) {
    return (
      <Sheet>
        <T variant="title2" center>
          This idea has moved on.
        </T>
      </Sheet>
    );
  }

  const pal = seasonColors(phaseSeason(nudge.phase));
  const when = new Date(`${nudge.targetDate}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  const isToday = nudge.date === k.today;

  return (
    <Sheet>
      <View style={styles.meta}>
        <Icon name={KIND_ICON[nudge.kind]} size={13} color={ink(pal.glow, dark)} />
        <T variant="caption" color={ink(pal.glow, dark)} style={{ letterSpacing: 0.9 }}>
          {KIND_LABEL[nudge.kind]} · {effort(nudge.minutes)} · {isToday ? 'today' : when}
        </T>
      </View>
      <T variant="title" style={{ marginTop: Space.m }}>
        {nudge.title}
      </T>
      <T variant="body" tone="secondary" style={{ marginTop: Space.m }}>
        {nudge.detail}
      </T>

      <View style={[styles.why, { borderColor: colors.hairline }]}>
        <T variant="caption" tone="tertiary">
          Why now
        </T>
        <T variant="callout">{nudge.why}</T>
      </View>

      {nudge.action?.type === 'message' ? (
        <View style={{ marginTop: Space.xl, gap: Space.s }}>
          <T variant="caption" tone="tertiary">
            Say it your way
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
        <T variant="footnote" tone="tertiary" center style={{ marginTop: Space.xl }}>
          You’ll get a reminder on the day.
        </T>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  why: { marginTop: Space.xl, paddingTop: Space.l, borderTopWidth: StyleSheet.hairlineWidth, gap: 4 },
  draft: { flexDirection: 'row', alignItems: 'center', gap: Space.m, padding: Space.l },
});
