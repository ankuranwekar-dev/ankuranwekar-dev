import { SIGNALS, type SignalId } from '@kairos/core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { haptic } from '@/platform/haptics';
import { relayConfigured } from '@/platform/relay';
import { rangeLabel, useKairos } from '@/state/kairos';
import { useStore } from '@/state/store';
import { Button, IconButton, Press } from '@/ui/controls';
import { Icon, SIGNAL_ICON } from '@/ui/icon';
import { Orb } from '@/ui/orb';
import { Screen } from '@/ui/screen';
import { T } from '@/ui/text';
import { alpha, ink, Radius, seasonColors, Space, useTheme } from '@/ui/theme';

export function HerToday() {
  const k = useKairos();
  const s = useStore();
  const { colors, dark } = useTheme();
  const pal = seasonColors(k.season);
  const paired = s.pairing.status === 'paired';
  const his = s.hisName || s.pairing.partnerName || '';
  const [logged, setLogged] = useState<string>();
  const [thanked, setThanked] = useState(false);

  useEffect(() => {
    if (!logged) return;
    const id = setTimeout(() => setLogged(undefined), 2200);
    return () => clearTimeout(id);
  }, [logged]);

  const top = (
    <View style={styles.top}>
      <View style={{ flex: 1 }} />
      <IconButton icon="person" label="You, sharing and settings" onPress={() => router.push('/profile')} />
    </View>
  );

  if (!k.forecast) {
    return (
      <Screen>
        {top}
        <View style={[styles.hero, { marginTop: Space.xxxl }]}>
          <Orb season={undefined} size={170} dim />
        </View>
        <T variant="title" center>
          Start with your cycle
        </T>
        <Button label="Add it" style={{ marginTop: Space.xxl }} onPress={() => router.push('/setup/her')} />
      </Screen>
    );
  }

  const bleeding = k.phase === 'menstrual';
  const facts = [`Day ${k.forecast.cycleDay}`];
  if (k.periodIn && !bleeding) facts.push(`Period ${rangeLabel(k.periodIn)}`);

  return (
    <Screen season={k.season}>
      {top}

      <Press haptics={false} onPress={() => router.push('/rhythm')} accessibilityLabel="Your rhythm">
        <Animated.View entering={FadeIn.duration(900)} style={styles.hero}>
          <Orb season={k.season} size={172} />
        </Animated.View>
        <View style={styles.titleBlock}>
          <T variant="display" center>
            Your{' '}
            <T variant="display" italic color={ink(pal.glow, dark)}>
              {k.copy?.name.toLowerCase()}
            </T>
          </T>
          <T variant="body" tone="secondary" center>
            {k.copy?.herBrief}
          </T>
          <T variant="footnote" tone="tertiary" center style={{ fontWeight: '600' }}>
            {facts.join('  ·  ')}
          </T>
        </View>
      </Press>

      {paired ? (
        <Signals his={his} />
      ) : relayConfigured ? (
        <Button label="Invite him" icon="qr" accent={pal.glow} onPress={() => router.push('/invite')} />
      ) : null}

      <View style={styles.footer}>
        <Button
          label={logged ?? (bleeding ? 'Period ended' : 'Period started')}
          icon={logged ? 'check' : 'drop'}
          kind="secondary"
          style={{ flex: 1 }}
          onPress={() => {
            if (bleeding) s.logPeriodEnd(k.today);
            else s.logPeriodStart(k.today);
            haptic.success();
            setLogged('Logged');
          }}
        />
        {paired ? (
          <Press
            accessibilityLabel={`Tell ${his || 'him'} he did something lovely`}
            onPress={() => {
              s.sendHeart();
              haptic.success();
              setThanked(true);
              setTimeout(() => setThanked(false), 2400);
            }}
            style={[styles.thanks, { backgroundColor: alpha(pal.glow, thanked ? 0.34 : 0.16) }]}>
            <Icon name={thanked ? 'check' : 'heart'} size={18} color={ink(pal.glow, dark)} />
          </Press>
        ) : null}
      </View>
      {paired ? (
        <T variant="footnote" tone="tertiary" center style={{ marginTop: Space.m }}>
          Tap the heart when {his || 'he'} gets it right.
        </T>
      ) : null}
      {!paired && !relayConfigured ? (
        <T variant="footnote" center color={colors.textTertiary} style={{ marginTop: Space.m }}>
          Pairing is switched off in this build.
        </T>
      ) : null}
    </Screen>
  );
}

/** Eight things she can say to him with one tap. They outrank the forecast on his phone. */
function Signals({ his }: { his: string }) {
  const send = useStore((s) => s.sendSignal);
  const { dark, colors } = useTheme();
  const { season } = useKairos();
  const pal = seasonColors(season);
  const [sent, setSent] = useState<SignalId>();

  useEffect(() => {
    if (!sent) return;
    const id = setTimeout(() => setSent(undefined), 2400);
    return () => clearTimeout(id);
  }, [sent]);

  return (
    <View style={{ gap: Space.s }}>
      <T variant="caption" tone="tertiary" center>
        Tell {his || 'him'}
      </T>
      <View style={styles.grid}>
        {SIGNALS.map((sig) => {
          const on = sent === sig.id;
          return (
            <View key={sig.id} style={styles.cell}>
              <Press
                accessibilityLabel={`Tell ${his || 'him'}: ${sig.label}`}
                onPress={() => {
                  send(sig.id);
                  haptic.success();
                  setSent(sig.id);
                }}
                style={[
                  styles.signal,
                  {
                    backgroundColor: on
                      ? alpha(pal.glow, 0.3)
                      : dark
                        ? 'rgba(255,255,255,0.065)'
                        : 'rgba(255,255,255,0.8)',
                    borderColor: on ? pal.glow : colors.border,
                  },
                ]}>
                {on ? (
                  <Animated.View entering={ZoomIn.springify().damping(12)}>
                    <Icon name="check" size={22} color={ink(pal.glow, dark)} />
                  </Animated.View>
                ) : (
                  <Icon name={SIGNAL_ICON[sig.id] ?? 'heart'} size={22} color={ink(pal.glow, dark)} />
                )}
                <T variant="footnote" center numberOfLines={2} style={styles.signalLabel}>
                  {on ? 'Sent' : sig.label}
                </T>
              </Press>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', minHeight: 40 },
  hero: { alignItems: 'center', justifyContent: 'center', height: 200 },
  titleBlock: { alignItems: 'center', gap: Space.xs, marginBottom: Space.xxl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  cell: { width: '25%', padding: 4 },
  signal: {
    height: 84,
    borderRadius: Radius.l,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  signalLabel: { fontSize: 12, lineHeight: 14, fontWeight: '600' },
  footer: { flexDirection: 'row', gap: Space.s, marginTop: Space.xl },
  thanks: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
});
