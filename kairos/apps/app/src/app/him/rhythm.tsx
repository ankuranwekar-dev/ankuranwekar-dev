import { PHASE_COPY, type Phase } from '@kairos/core';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { calendarAvailable, syncSeasonsToCalendar } from '@/platform/calendar';
import { haptic } from '@/platform/haptics';
import { useKairos } from '@/state/kairos';
import { useStore } from '@/state/store';
import { Button, SectionLabel } from '@/ui/controls';
import { Glass } from '@/ui/glass';
import { Icon } from '@/ui/icon';
import { useScreenSize } from '@/ui/frame';
import { CycleRing, SeasonWeeks } from '@/ui/ring';
import { Screen } from '@/ui/screen';
import { T } from '@/ui/text';
import { alpha, MaxWidth, Radius, seasonColors, Space, useTheme, ink } from '@/ui/theme';

const CONFIDENCE = {
  high: { label: 'Sharp', body: 'Her tracking has located this cycle’s ovulation.' },
  medium: { label: 'Good', body: 'Built from her recent cycles. It sharpens as she logs.' },
  low: { label: 'Rough', body: 'Early days. Every cycle makes the forecast tighter.' },
} as const;

const LEGEND: { phase: Phase; label: string }[] = [
  { phase: 'menstrual', label: 'Winter' },
  { phase: 'follicular', label: 'Spring' },
  { phase: 'ovulatory', label: 'Summer' },
  { phase: 'luteal', label: 'Autumn' },
];

export default function Rhythm() {
  const k = useKairos();
  const { colors, dark } = useTheme();
  const { width } = useScreenSize();
  const calendar = useStore((s) => s.calendar);
  const setCalendar = useStore((s) => s.setCalendar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const snap = k.snapshot;
  const size = Math.min(width, MaxWidth) - Space.xl * 2 - 10;

  if (!snap || snap.status !== 'ok' || !snap.cycle) {
    return (
      <Screen>
        <T variant="title">Rhythm</T>
        <T variant="callout" tone="secondary" style={{ marginTop: Space.s }}>
          Her rhythm appears here once she shares it.
        </T>
      </Screen>
    );
  }

  const pal = seasonColors(k.season);
  const conf = CONFIDENCE[snap.confidence];
  const fertility = snap.share === 'fertility';
  const center =
    k.summerIn !== undefined && fertility
      ? `${k.copy?.name} · summer in ${k.summerIn} days`
      : k.periodIn && k.phase !== 'menstrual'
        ? `${k.copy?.name} · period in ~${Math.max(1, k.periodIn.likely)} days`
        : k.copy?.name;

  const sync = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await syncSeasonsToCalendar(
        snap.days.filter((d) => d.date >= k.today),
        {
          ...(calendar.codenames ? { codenames: calendar.codenames } : {}),
        },
      );
      haptic.success();
      setCalendar({ ...calendar, synced: true, lastSync: new Date().toISOString() });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach your calendar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen season={k.season}>
      <T variant="title">Rhythm</T>
      <T variant="callout" tone="secondary" style={{ marginTop: Space.xs }}>
        Where she is, and what’s coming.
      </T>

      <View style={styles.ring}>
        <CycleRing
          days={snap.days}
          start={snap.cycle.start}
          length={snap.cycle.length}
          today={k.today}
          size={size}
          centerTop={k.cycleDay ? `Day ${k.cycleDay}` : '—'}
          {...(center ? { centerBottom: center } : {})}
        />
      </View>

      <View style={styles.legend}>
        {LEGEND.map((l) => (
          <View key={l.phase} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: seasonColors(PHASE_COPY[l.phase].season).from }]} />
            <T variant="footnote" tone="secondary">
              {l.label}
            </T>
          </View>
        ))}
        {fertility ? (
          <View style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: seasonColors('summer').from }]} />
            <T variant="footnote" tone="secondary">
              {snap.intent === 'trying' ? 'Best days' : 'Peak days'}
            </T>
          </View>
        ) : null}
      </View>

      {k.copy ? (
        <>
          <SectionLabel>{`Her ${k.copy.name.toLowerCase()}`}</SectionLabel>
          <Glass radius={Radius.l} style={{ padding: Space.xl, gap: Space.l }}>
            <T variant="title2">{k.copy.read}</T>
            <View style={{ gap: Space.s }}>
              <T variant="caption" color={ink(pal.glow, dark)}>
                Tends to land well
              </T>
              {k.copy.helps.map((h) => (
                <View key={h} style={styles.bullet}>
                  <View style={[styles.bulletDot, { backgroundColor: pal.glow }]} />
                  <T variant="callout" style={{ flex: 1 }}>
                    {h}
                  </T>
                </View>
              ))}
            </View>
            <View style={{ gap: Space.s }}>
              <T variant="caption" tone="tertiary">
                Tends not to
              </T>
              {k.copy.avoid.map((h) => (
                <View key={h} style={styles.bullet}>
                  <View style={[styles.bulletDot, { backgroundColor: colors.textTertiary }]} />
                  <T variant="callout" tone="secondary" style={{ flex: 1 }}>
                    {h}
                  </T>
                </View>
              ))}
            </View>
          </Glass>
        </>
      ) : null}

      <SectionLabel>Next eight weeks</SectionLabel>
      <Glass radius={Radius.l} style={{ padding: Space.l }}>
        <SeasonWeeks days={snap.days} today={k.today} />
      </Glass>

      <SectionLabel>In your calendar</SectionLabel>
      <Glass radius={Radius.l} style={{ padding: Space.xl, gap: Space.m }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Space.m }}>
          <View style={[styles.calIcon, { backgroundColor: alpha(pal.glow, 0.16) }]}>
            <Icon name="calendar" size={18} color={ink(pal.glow, dark)} />
          </View>
          <View style={{ flex: 1 }}>
            <T variant="headline">
              {calendar.synced ? 'Seasons are in your calendar' : 'Add seasons to your calendar'}
            </T>
            <T variant="footnote" tone="secondary">
              All-day, marked free, titled only “Spring”, “Summer”… Nobody looking over your shoulder learns a thing.
            </T>
          </View>
        </View>
        {calendarAvailable() ? (
          <Button
            label={
              busy
                ? 'Adding…'
                : calendar.synced
                  ? 'Refresh'
                  : Platform.OS === 'web'
                    ? 'Download .ics'
                    : 'Add to Calendar'
            }
            kind={calendar.synced ? 'secondary' : 'primary'}
            accent={calendar.synced ? undefined : pal.glow}
            onPress={sync}
            disabled={busy}
          />
        ) : (
          <T variant="footnote" tone="tertiary">
            In the iPhone and Android apps this is one tap. This embedded preview can’t save files.
          </T>
        )}
        {error ? (
          <T variant="footnote" color={colors.danger}>
            {error}
          </T>
        ) : null}
      </Glass>

      <SectionLabel>Forecast</SectionLabel>
      <Glass radius={Radius.l} style={{ padding: Space.xl, gap: Space.xs }}>
        <T variant="headline">
          Confidence:{' '}
          <T variant="headline" color={ink(pal.glow, dark)}>
            {conf.label}
          </T>
        </T>
        <T variant="footnote" tone="secondary">
          {conf.body} Seasons are tendencies, not rules. When she sends a signal, it always beats the forecast.
        </T>
      </Glass>
    </Screen>
  );
}

const styles = StyleSheet.create({
  ring: { alignItems: 'center', marginTop: Space.xl },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Space.l, marginTop: Space.l },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.m },
  bulletDot: { width: 5, height: 5, borderRadius: 3, marginTop: 9 },
  calIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
