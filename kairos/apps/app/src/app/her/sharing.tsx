import { describeShare, NEVER_SHARED, type Intent, type ShareLevel } from '@kairos/core';
import { router } from 'expo-router';
import { StyleSheet, Switch, View } from 'react-native';

import { haptic } from '@/platform/haptics';
import { unpair } from '@/platform/relay';
import { useKairos } from '@/state/kairos';
import { useStore } from '@/state/store';
import { Button, Press, SectionLabel } from '@/ui/controls';
import { Glass } from '@/ui/glass';
import { Icon } from '@/ui/icon';
import { Invite } from '@/ui/invite';
import { Screen } from '@/ui/screen';
import { T } from '@/ui/text';
import { alpha, Radius, seasonColors, Space, useTheme, ink } from '@/ui/theme';

const INTENTS: { value: Intent; title: string; body: string }[] = [
  {
    value: 'trying',
    title: 'Trying for a baby',
    body: 'He knows your fertile days and his part in them, and stays steady through the wait.',
  },
  { value: 'closer', title: 'Growing closer', body: 'Your seasons guide his care and romance. No pregnancy goal.' },
  { value: 'basics', title: 'Just the basics', body: 'He gets a heads-up around your period. That’s all.' },
];

const LEVELS: { value: ShareLevel; title: string; body: string }[] = [
  { value: 'period', title: 'Period only', body: 'When it’s due, and a heads-up before.' },
  { value: 'seasons', title: 'Seasons', body: 'Which season you’re in, every day. No fertility numbers.' },
  { value: 'fertility', title: 'Seasons + fertility', body: 'Adds your fertile window and best days.' },
];

export default function Sharing() {
  const s = useStore();
  const k = useKairos();
  const { colors, dark } = useTheme();
  const pal = seasonColors(k.season);
  const his = s.hisName || s.pairing.partnerName || 'him';
  const paired = s.pairing.status === 'paired';

  return (
    <Screen season={k.season}>
      <T variant="title">Sharing</T>
      <T variant="callout" tone="secondary" style={{ marginTop: Space.xs }}>
        You decide what {his} sees. Change it any time; it updates on his phone within seconds.
      </T>

      {paired ? (
        <Glass radius={Radius.l} style={[styles.paired, { marginTop: Space.xl }]}>
          <View style={[styles.round, { backgroundColor: alpha(pal.glow, 0.16) }]}>
            <Icon name="shield" size={18} color={ink(pal.glow, dark)} />
          </View>
          <View style={{ flex: 1 }}>
            <T variant="headline">Paired with {his}</T>
            <T variant="footnote" tone="secondary">
              End-to-end encrypted · safety code {s.pairing.safety?.join(' ')}
            </T>
          </View>
        </Glass>
      ) : (
        <View style={{ marginTop: Space.xl }}>
          <Invite />
        </View>
      )}

      <SectionLabel>Why you’re here</SectionLabel>
      <View style={{ gap: Space.s }}>
        {INTENTS.map((o) => (
          <Option
            key={o.value}
            title={o.title}
            body={o.body}
            selected={s.intent === o.value}
            accent={pal.glow}
            onPress={() => s.setIntent(o.value)}
          />
        ))}
      </View>

      <SectionLabel>{`What ${his} sees`}</SectionLabel>
      <View style={{ gap: Space.s }}>
        {LEVELS.map((o) => (
          <Option
            key={o.value}
            title={o.title}
            body={o.body}
            selected={s.share === o.value}
            accent={pal.glow}
            onPress={() => s.setShare(o.value)}
          />
        ))}
      </View>
      {s.share === 'fertility' && s.intent !== 'trying' ? (
        <T variant="footnote" tone="secondary" style={{ marginTop: Space.s, paddingHorizontal: 4 }}>
          Fertility estimates help timing; they are not birth control. If you’re avoiding pregnancy, use contraception
          every day of the cycle.
        </T>
      ) : null}

      <Glass radius={Radius.l} style={{ padding: Space.xl, gap: Space.m, marginTop: Space.m }}>
        <T variant="caption" color={ink(pal.glow, dark)}>
          {his} can see
        </T>
        {describeShare(s.share, s.intent).map((l) => (
          <View key={l} style={styles.line}>
            <Icon name="eye" size={14} color={colors.textSecondary} />
            <T variant="callout" style={{ flex: 1 }}>
              {l}
            </T>
          </View>
        ))}
        <T variant="caption" tone="tertiary" style={{ marginTop: Space.s }}>
          Never shared
        </T>
        {NEVER_SHARED.map((l) => (
          <View key={l} style={styles.line}>
            <Icon name="eyeOff" size={14} color={colors.textTertiary} />
            <T variant="callout" tone="secondary" style={{ flex: 1 }}>
              {l}
            </T>
          </View>
        ))}
      </Glass>

      <SectionLabel>Control</SectionLabel>
      <Glass radius={Radius.l} style={{ padding: Space.xl, gap: Space.l }}>
        <View style={styles.line}>
          <View style={{ flex: 1 }}>
            <T variant="headline">Pause sharing</T>
            <T variant="footnote" tone="secondary">
              {his} sees “paused”, nothing else. No reason given, none needed.
            </T>
          </View>
          <Switch
            value={s.paused}
            onValueChange={(v) => {
              haptic.tap();
              s.setPaused(v);
            }}
            trackColor={{ true: pal.glow, false: alpha(colors.text, 0.15) }}
          />
        </View>
        {paired ? (
          <Button
            label="Unpair"
            kind="secondary"
            onPress={async () => {
              haptic.warning();
              await unpair().catch(() => {});
              s.setPairing({ status: 'none' });
              if (s.demo) router.replace('/welcome');
            }}
          />
        ) : null}
        <T variant="footnote" tone="tertiary">
          Unpairing deletes every message on the relay and the keys on both phones. Nothing can be recovered, by anyone.
        </T>
      </Glass>
    </Screen>
  );
}

function Option({
  title,
  body,
  selected,
  accent,
  onPress,
}: {
  title: string;
  body: string;
  selected: boolean;
  accent: string;
  onPress: () => void;
}) {
  const { colors, dark } = useTheme();
  return (
    <Press onPress={onPress} accessibilityLabel={title}>
      <Glass
        radius={Radius.l}
        style={[styles.option, selected ? { borderColor: alpha(accent, 0.7), borderWidth: 1 } : null]}>
        <View style={[styles.radio, { borderColor: selected ? accent : colors.textTertiary }]}>
          {selected ? <View style={[styles.radioDot, { backgroundColor: accent }]} /> : null}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="headline">{title}</T>
          <T variant="footnote" tone="secondary">
            {body}
          </T>
        </View>
      </Glass>
    </Press>
  );
}

const styles = StyleSheet.create({
  paired: { flexDirection: 'row', alignItems: 'center', gap: Space.m, padding: Space.l },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: Space.m, padding: Space.l },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  line: { flexDirection: 'row', alignItems: 'center', gap: Space.m },
});
