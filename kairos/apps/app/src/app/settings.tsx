import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/platform/haptics';
import { unpair } from '@/platform/relay';
import { useKairos } from '@/state/kairos';
import { useStore } from '@/state/store';
import { Button, Chip, Press, SectionLabel, Segmented } from '@/ui/controls';
import { Glass } from '@/ui/glass';
import { Icon } from '@/ui/icon';
import { T } from '@/ui/text';
import { alpha, MaxWidth, Radius, seasonColors, Space, useTheme } from '@/ui/theme';

export default function Settings() {
  const s = useStore();
  const k = useKairos();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const pal = seasonColors(k.season);
  const [pregnancy, setPregnancy] = useState<'positive' | 'negative'>();

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={[styles.root, { paddingTop: insets.top + Space.l, paddingBottom: insets.bottom + Space.xxxl }]}>
      <View style={styles.column}>
        <View style={styles.header}>
          <T variant="title">Settings</T>
          <Press onPress={() => router.back()} accessibilityLabel="Close" style={[styles.close, { backgroundColor: alpha(colors.text, 0.08) }]}>
            <Icon name="close" size={15} color={colors.text} />
          </Press>
        </View>

        {s.role === 'her' && s.intent === 'trying' ? (
          <>
            <SectionLabel>Pregnancy test</SectionLabel>
            <Glass radius={Radius.l} style={[styles.card, section === 'pregnancy' ? { borderColor: pal.glow, borderWidth: 1 } : null]}>
              {pregnancy === 'positive' ? (
                <>
                  <T variant="title2">Congratulations.</T>
                  <T variant="callout" tone="secondary">
                    Sharing is paused, quietly. Kairos will never tell him before you do. When you’re ready, tell him your way, then
                    resume sharing from Sharing.
                  </T>
                </>
              ) : pregnancy === 'negative' ? (
                <T variant="callout" tone="secondary">
                  Logged. Be gentle with yourself today; he already has a nudge to be extra kind this week.
                </T>
              ) : (
                <>
                  <T variant="callout" tone="secondary">
                    A result is never shared. A positive one pauses sharing so the news is yours to tell.
                  </T>
                  <View style={{ flexDirection: 'row', gap: Space.s }}>
                    <Button
                      label="Positive"
                      accent={pal.glow}
                      style={{ flex: 1 }}
                      onPress={() => {
                        s.logPregnancyTest(k.today, true);
                        s.setPaused(true);
                        haptic.success();
                        setPregnancy('positive');
                      }}
                    />
                    <Button
                      label="Negative"
                      kind="secondary"
                      style={{ flex: 1 }}
                      onPress={() => {
                        s.logPregnancyTest(k.today, false);
                        setPregnancy('negative');
                      }}
                    />
                  </View>
                </>
              )}
            </Glass>
          </>
        ) : null}

        {s.role === 'him' ? (
          <>
            <SectionLabel>Ideas</SectionLabel>
            <Glass radius={Radius.l} style={styles.card}>
              <T variant="headline">How often</T>
              <Segmented
                value={s.prefs.cadence}
                onChange={(cadence) => s.updatePrefs({ cadence })}
                options={[
                  { value: 'light', label: '3 a week' },
                  { value: 'steady', label: '5 a week' },
                  { value: 'devoted', label: 'Daily' },
                ]}
              />
              <T variant="headline" style={{ marginTop: Space.s }}>
                Arrive at
              </T>
              <View style={styles.chips}>
                {['07:30', '08:30', '12:00', '17:30'].map((t) => (
                  <Chip key={t} label={t} selected={s.prefs.notifyAt === t} accent={pal.glow} onPress={() => s.updatePrefs({ notifyAt: t })} />
                ))}
              </View>
              <T variant="headline" style={{ marginTop: Space.s }}>
                Spend comfort
              </T>
              <Segmented
                value={String(s.prefs.budget) as '0' | '1' | '2' | '3'}
                onChange={(v) => s.updatePrefs({ budget: Number(v) as 0 | 1 | 2 | 3 })}
                options={[
                  { value: '0', label: 'Free' },
                  { value: '1', label: '$' },
                  { value: '2', label: '$$' },
                  { value: '3', label: '$$$' },
                ]}
              />
              <T variant="headline" style={{ marginTop: Space.s }}>
                Weekend
              </T>
              <Segmented
                value={(s.prefs.weekendDays ?? [0, 6]).join(',') === '5,6' ? 'fri' : 'sat'}
                onChange={(v) => s.updatePrefs({ weekendDays: v === 'fri' ? [5, 6] : [0, 6] })}
                options={[
                  { value: 'sat', label: 'Sat – Sun' },
                  { value: 'fri', label: 'Fri – Sat' },
                ]}
              />
            </Glass>

            <SectionLabel>Privacy on your phone</SectionLabel>
            <Glass radius={Radius.l} style={styles.card}>
              <View style={styles.line}>
                <View style={{ flex: 1 }}>
                  <T variant="headline">Show details on lock screen</T>
                  <T variant="footnote" tone="secondary">
                    Off: “A little idea for today”. On: the idea itself. Neither ever mentions her cycle.
                  </T>
                </View>
                <Switch
                  value={Boolean(s.prefs.detailedNotifications)}
                  onValueChange={(v) => s.updatePrefs({ detailedNotifications: v })}
                  trackColor={{ true: pal.glow, false: alpha(colors.text, 0.15) }}
                />
              </View>
            </Glass>
          </>
        ) : null}

        <SectionLabel>Your data</SectionLabel>
        <Glass radius={Radius.l} style={styles.card}>
          <Bullet text="Her raw data never leaves her phone. Only a reduced forecast is shared, end-to-end encrypted." />
          <Bullet text="Our relay stores envelopes it cannot open, and deletes them after 30 days." />
          <Bullet text="No ads, no data brokers, no selling. The business is a subscription." />
          <Bullet text="Unpairing destroys the keys on both phones. There is no recovery, by design." />
        </Glass>

        {s.demo ? (
          <>
            <SectionLabel>Demo</SectionLabel>
            <Glass radius={Radius.l} style={styles.card}>
              <T variant="callout" tone="secondary">
                You’re exploring with Maya and Alex, a simulated couple. Use the bar at the top to switch phones and move through
                time.
              </T>
              <Button
                label="Leave the demo"
                kind="secondary"
                onPress={() => {
                  s.reset();
                  router.replace('/welcome');
                }}
              />
            </Glass>
          </>
        ) : (
          <>
            <SectionLabel>Account</SectionLabel>
            <Glass radius={Radius.l} style={styles.card}>
              <Button
                label="Unpair and erase this phone"
                kind="secondary"
                onPress={async () => {
                  haptic.warning();
                  await unpair().catch(() => {});
                  s.reset();
                  router.replace('/welcome');
                }}
              />
            </Glass>
          </>
        )}

        <T variant="footnote" tone="tertiary" center style={{ marginTop: Space.xxl }}>
          Kairos 0.1 · Fertility estimates support timing and are not contraception.
        </T>
      </View>
    </ScrollView>
  );
}

function Bullet({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.line}>
      <Icon name="lock" size={12} color={colors.textTertiary} />
      <T variant="callout" style={{ flex: 1 }}>
        {text}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', paddingHorizontal: Space.xl },
  column: { width: '100%', maxWidth: MaxWidth },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  card: { padding: Space.xl, gap: Space.m },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.s },
  line: { flexDirection: 'row', alignItems: 'center', gap: Space.m },
});
