import type { ShareLevel } from '@kairos/core';
import { router } from 'expo-router';
import { StyleSheet, TextInput, View } from 'react-native';

import { rangeLabel, useKairos } from '@/state/kairos';
import { useStore } from '@/state/store';
import { Button, Segmented, Toggle } from '@/ui/controls';
import { Glass } from '@/ui/glass';
import { Orb } from '@/ui/orb';
import { SetupFrame } from '@/ui/setup-frame';
import { T } from '@/ui/text';
import { alpha, ink, Radius, seasonColors, Space, useTheme } from '@/ui/theme';

const LEVELS: { value: ShareLevel; label: string }[] = [
  { value: 'period', label: 'Period' },
  { value: 'seasons', label: 'Seasons' },
  { value: 'fertility', label: 'Everything' },
];

/** Her second and last step: choose how much he sees, watching his screen change as she does. */
export default function ShareSetup() {
  const s = useStore();
  const k = useKairos();
  const { colors, dark } = useTheme();
  const showSeason = s.share !== 'period';
  const pal = seasonColors(showSeason ? k.season : undefined);
  const name = s.playbook.name.trim();
  const trying = s.intent === 'trying';

  const done = (invite: boolean) => {
    s.finishOnboarding();
    router.dismissTo('/today');
    if (invite) router.push('/invite');
  };

  return (
    <SetupFrame
      title="What should he see?"
      subtitle="Change it any time."
      footer={
        <>
          <Button label="Invite him" icon="qr" onPress={() => done(true)} />
          <Button label="Later" kind="ghost" onPress={() => done(false)} />
        </>
      }>
      <View style={{ gap: Space.l }}>
        <Segmented options={LEVELS} value={s.share} onChange={s.setShare} accent={pal.glow} />

        {/* His screen, live. */}
        <Glass radius={Radius.xl} style={styles.preview}>
          <Orb season={showSeason ? k.season : undefined} size={96} dim={!showSeason} />
          <T variant="title2" center style={{ marginTop: Space.m }}>
            {name ? `${name}’s ` : 'Her '}
            {showSeason ? (
              <T variant="title2" italic color={ink(pal.glow, dark)}>
                {k.copy?.name.toLowerCase() ?? 'season'}
              </T>
            ) : (
              'period'
            )}
          </T>
          <View style={styles.chips}>
            {k.periodIn ? (
              <View style={[styles.chip, { backgroundColor: alpha(colors.text, 0.08) }]}>
                <T variant="footnote" style={{ fontWeight: '600' }}>
                  Period {rangeLabel(k.periodIn)}
                </T>
              </View>
            ) : null}
            {s.share === 'fertility' ? (
              <View style={[styles.chip, { backgroundColor: alpha(pal.glow, 0.2) }]}>
                <T variant="footnote" style={{ fontWeight: '600' }}>
                  {trying ? 'Fertile days' : 'Peak days'}
                </T>
              </View>
            ) : null}
          </View>
        </Glass>

        <View style={[styles.row, { borderColor: colors.hairline }]}>
          <T variant="callout">Your name</T>
          <TextInput
            value={s.playbook.name}
            onChangeText={(t) => s.updatePlaybook({ name: t })}
            placeholder="Optional"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            style={[styles.input, { color: colors.text }]}
          />
        </View>
        <View style={[styles.row, { borderColor: colors.hairline }]}>
          <T variant="callout" style={{ flex: 1 }}>
            We’re trying for a baby
          </T>
          <Toggle
            value={trying}
            onChange={(on) => s.setIntent(on ? 'trying' : 'closer')}
            label="We’re trying for a baby"
            accent={pal.glow}
          />
        </View>
      </View>
    </SetupFrame>
  );
}

const styles = StyleSheet.create({
  preview: { alignItems: 'center', padding: Space.xl },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Space.s,
    marginTop: Space.m,
    minHeight: 28,
  },
  chip: { paddingHorizontal: 12, height: 28, borderRadius: 14, justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.m,
    minHeight: 56,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, textAlign: 'right', fontSize: 17, height: 48 },
});
