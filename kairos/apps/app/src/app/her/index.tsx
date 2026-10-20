import { addDays, SIGNALS, type SignalId } from '@kairos/core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';

import { haptic } from '@/platform/haptics';
import { rangeLabel, useKairos } from '@/state/kairos';
import { useStore } from '@/state/store';
import { Button, Chip, Press, SectionLabel } from '@/ui/controls';
import { Glass } from '@/ui/glass';
import { Icon, SIGNAL_ICON } from '@/ui/icon';
import { Orb } from '@/ui/orb';
import { Screen } from '@/ui/screen';
import { T } from '@/ui/text';
import { alpha, Radius, seasonColors, Space, useTheme, ink } from '@/ui/theme';

function longDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}
function shortDay(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
}

export default function HerToday() {
  const k = useKairos();
  const s = useStore();
  const { colors, dark } = useTheme();
  const pal = seasonColors(k.season);
  const his = s.hisName || s.pairing.partnerName || '';
  const f = k.forecast;

  if (!f) {
    return (
      <Screen>
        <T variant="title">Let’s start with one date</T>
        <T variant="callout" tone="secondary" style={{ marginTop: Space.s }}>
          When did your last period start?
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Space.s, marginTop: Space.l }}>
          {[0, 1, 2, 3, 5, 7, 10, 14].map((d) => (
            <Chip key={d} label={d === 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`} onPress={() => s.logPeriodStart(addDays(k.today, -d))} />
          ))}
        </View>
      </Screen>
    );
  }

  const chips: string[] = [`Day ${f.cycleDay}`];
  if (k.periodIn && k.phase !== 'menstrual') chips.push(`Period ${rangeLabel(k.periodIn)}`);
  if (s.intent === 'trying' && f.fertileWindow) {
    const best = f.fertileWindow.best.filter((b) => b >= k.today);
    if (k.summerIn !== undefined) chips.push(`Fertile ${k.summerIn === 1 ? 'tomorrow' : `in ${k.summerIn} days`}`);
    else if (best.length) chips.push(`Best: ${best.map(shortDay).join(' & ')}`);
  }
  if (f.ovulation?.confirmed && f.ovulation.date < k.today && k.phase !== 'menstrual') chips.push('Ovulation confirmed');

  return (
    <Screen season={k.season}>
      <View style={styles.header}>
        <T variant="caption" tone="tertiary">
          {longDate(k.today)}
        </T>
        <Press onPress={() => router.push('/settings')} accessibilityLabel="Settings" style={styles.iconButton}>
          <Icon name="gear" size={18} color={colors.textSecondary} />
        </Press>
      </View>

      <Animated.View entering={FadeIn.duration(900)} style={styles.hero}>
        <Orb season={k.season} size={186} />
      </Animated.View>

      <View style={styles.titleBlock}>
        <T variant="display" center>
          Your <T variant="display" italic color={ink(pal.glow, dark)}>{k.copy?.name.toLowerCase()}</T>
        </T>
        <T variant="callout" tone="secondary" center style={{ maxWidth: 360 }}>
          {k.copy?.herRead}
        </T>
        <View style={styles.chips}>
          {chips.map((c) => (
            <View key={c} style={[styles.chip, { backgroundColor: alpha(pal.glow, 0.13) }]}>
              <T variant="footnote" style={{ fontWeight: '600' }}>
                {c}
              </T>
            </View>
          ))}
        </View>
      </View>

      {s.pairing.status !== 'paired' ? (
        <Press onPress={() => router.push('/her/sharing')} accessibilityLabel="Invite him" style={{ marginTop: Space.xl }}>
          <Glass radius={Radius.l} tint={pal.glow} style={styles.invite}>
            <Icon name="qr" size={20} color={ink(pal.glow, dark)} />
            <View style={{ flex: 1 }}>
              <T variant="headline">Invite him</T>
              <T variant="footnote" tone="secondary">
                Nothing reaches him until you pair, and only what you choose after that.
              </T>
            </View>
            <Icon name="chevron" size={14} color={colors.textTertiary} />
          </Glass>
        </Press>
      ) : null}

      <SectionLabel>{`Tell ${his || 'him'}, without telling him`}</SectionLabel>
      <Signals his={his} />

      <SectionLabel>Log</SectionLabel>
      <QuickLog />

      <SectionLabel>{his ? `${his}’s side` : 'His side'}</SectionLabel>
      <Glass radius={Radius.l} style={{ padding: Space.xl, gap: Space.m }}>
        <View style={{ flexDirection: 'row', gap: Space.m, alignItems: 'center' }}>
          <View style={[styles.round, { backgroundColor: alpha(pal.glow, 0.16) }]}>
            <Icon name="sparkles" size={17} color={ink(pal.glow, dark)} />
          </View>
          <View style={{ flex: 1 }}>
            <T variant="headline">{k.todayNudge ? `${his || 'He'} has a small idea for today` : `A quiet day for ${his || 'him'}`}</T>
            <T variant="footnote" tone="secondary">
              Surprise mode is on. You’ll see it when it happens.
            </T>
          </View>
        </View>
        <Hearts his={his} accent={pal.glow} />
      </Glass>

      <T variant="footnote" tone="tertiary" center style={{ marginTop: Space.xl }}>
        {s.healthSource === 'manual' ? 'Logged by you' : `Synced from ${s.healthSource === 'apple-health' ? 'Apple Health' : 'Health Connect'}`} · Only your season and forecast reach {his || 'him'}, end-to-end
        encrypted.
      </T>
    </Screen>
  );
}

function Signals({ his }: { his: string }) {
  const send = useStore((s) => s.sendSignal);
  const { colors, dark } = useTheme();
  const { season } = useKairos();
  const pal = seasonColors(season);
  const [sent, setSent] = useState<SignalId>();
  const [craving, setCraving] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!sent) return;
    const id = setTimeout(() => setSent(undefined), 2600);
    return () => clearTimeout(id);
  }, [sent]);

  const fire = (id: SignalId, n?: string) => {
    send(id, n);
    haptic.success();
    setSent(id);
    setCraving(false);
    setNote('');
  };

  return (
    <View style={{ gap: Space.m }}>
      <View style={styles.signalGrid}>
        {SIGNALS.map((sig) => {
          const on = sent === sig.id;
          return (
            <Press
              key={sig.id}
              accessibilityLabel={`Send: ${sig.label}`}
              onPress={() => (sig.takesNote ? setCraving((c) => !c) : fire(sig.id))}
              style={styles.signalCell}>
              <Glass radius={Radius.l} tint={on ? pal.glow : undefined} style={[styles.signal, on ? { borderColor: pal.glow, borderWidth: 1 } : null]}>
                {on ? (
                  <Animated.View entering={ZoomIn.springify().damping(12)} style={{ alignItems: 'center', gap: 4 }}>
                    <Icon name="check" size={20} color={ink(pal.glow, dark)} />
                    <T variant="footnote" style={{ fontWeight: '600' }}>
                      Sent
                    </T>
                  </Animated.View>
                ) : (
                  <>
                    <Icon name={SIGNAL_ICON[sig.id] ?? 'heart'} size={24} color={ink(pal.glow, dark)} />
                    <T variant="footnote" center style={{ fontWeight: '600' }}>
                      {sig.label}
                    </T>
                  </>
                )}
              </Glass>
            </Press>
          );
        })}
      </View>
      {craving ? (
        <Animated.View entering={FadeInDown.duration(250)}>
          <Glass radius={Radius.l} style={styles.cravingBox}>
            <TextInput
              autoFocus
              value={note}
              onChangeText={setNote}
              onSubmitEditing={() => fire('craving', note)}
              placeholder="Craving… (leave blank for your usual)"
              placeholderTextColor={colors.textTertiary}
              style={[styles.cravingInput, { color: colors.text }]}
              returnKeyType="send"
            />
            <Button label="Send" compact accent={pal.glow} onPress={() => fire('craving', note)} />
          </Glass>
        </Animated.View>
      ) : null}
      <T variant="footnote" tone="tertiary" style={{ paddingHorizontal: 4 }}>
        {his || 'He'} gets a gentle, specific prompt. Nothing on his lock screen gives anything away.
      </T>
    </View>
  );
}

function QuickLog() {
  const s = useStore();
  const k = useKairos();
  const { colors, dark } = useTheme();
  const [logged, setLogged] = useState<string>();
  const bleeding = k.phase === 'menstrual';
  const done = (label: string) => {
    haptic.success();
    setLogged(label);
    setTimeout(() => setLogged(undefined), 2200);
  };
  return (
    <Glass radius={Radius.l} style={{ padding: Space.l, gap: Space.m }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Space.s }}>
        {bleeding ? (
          <Chip label="Period ended" icon="drop" onPress={() => (s.logPeriodEnd(k.today), done('Period end logged'))} />
        ) : (
          <Chip label="Period started" icon="drop" onPress={() => (s.logPeriodStart(k.today), done('Period start logged'))} />
        )}
        <Chip label="LH positive" icon="test" onPress={() => (s.logLH(k.today, 'positive'), done('Positive LH test logged'))} />
        <Chip label="LH negative" icon="test" onPress={() => (s.logLH(k.today, 'negative'), done('Negative LH test logged'))} />
        {s.intent === 'trying' ? (
          <Chip label="Pregnancy test" icon="sparkles" onPress={() => router.push('/settings?section=pregnancy')} />
        ) : null}
      </View>
      <T variant="footnote" tone={logged ? 'primary' : 'tertiary'} style={logged ? { color: colors.positive } : null}>
        {logged ?? 'One tap. Temperatures from your watch arrive on their own.'}
      </T>
    </Glass>
  );
}

function Hearts({ his, accent }: { his: string; accent: string }) {
  const send = useStore((s) => s.sendHeart);
  const [sent, setSent] = useState(false);
  return (
    <Press
      accessibilityLabel={`Send ${his || 'him'} a thank-you`}
      onPress={() => {
        send();
        haptic.success();
        setSent(true);
        setTimeout(() => setSent(false), 2400);
      }}
      style={[styles.heartButton, { backgroundColor: alpha(accent, sent ? 0.28 : 0.14) }]}>
      <Icon name="heart" size={16} color={accent} />
      <T variant="label">{sent ? `${his || 'He'} will know` : `He did something lovely`}</T>
    </Press>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 },
  iconButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', justifyContent: 'center', height: 226 },
  titleBlock: { alignItems: 'center', gap: Space.s, marginBottom: Space.s },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Space.s, marginTop: Space.s },
  chip: { paddingHorizontal: 12, height: 28, borderRadius: 14, justifyContent: 'center' },
  signalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.s },
  signalCell: { flexBasis: '23%', flexGrow: 1 },
  signal: { height: 92, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 4 },
  cravingBox: { flexDirection: 'row', alignItems: 'center', gap: Space.s, padding: Space.s, paddingLeft: Space.l },
  cravingInput: { flex: 1, fontSize: 16, height: 44 },
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  invite: { flexDirection: 'row', alignItems: 'center', gap: Space.m, padding: Space.l },
  heartButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Space.s, height: 46, borderRadius: Radius.pill },
});
