import { diffDays, weekdayName, type ISODate } from '@kairos/core';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { haptic } from '@/platform/haptics';
import { rangeLabel, useKairos, type Kairos } from '@/state/kairos';
import { useStore } from '@/state/store';
import { Button, IconButton, Press } from '@/ui/controls';
import { DayStrip } from '@/ui/day-strip';
import { Glass } from '@/ui/glass';
import { Icon } from '@/ui/icon';
import { NudgeCard } from '@/ui/nudge-card';
import { Orb } from '@/ui/orb';
import { Screen } from '@/ui/screen';
import { SignalCard } from '@/ui/signal-card';
import { T } from '@/ui/text';
import { ink, Radius, seasonColors, Space, useTheme } from '@/ui/theme';

/** "Wednesday" for the last few days, "Nov 4" for anything older, where a weekday alone would be ambiguous. */
function aroundDay(date: ISODate, today: ISODate): string {
  if (diffDays(date, today) <= 6) return weekdayName(date);
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** The one fact worth a line under the orb: what is coming next. */
function nextUp(k: Kairos): string | undefined {
  const share = k.snapshot?.share;
  const trying = k.snapshot?.intent === 'trying';
  if (share === 'fertility') {
    if (k.day?.peak) return trying ? 'A best day, today' : 'A peak day, today';
    const ahead = (k.snapshot?.fertileWindow?.best ?? []).filter((b) => b > k.today);
    if (k.phase === 'ovulatory' && ahead.length) {
      return `${trying ? 'Best' : 'Peak'} ${ahead.length > 1 ? 'days' : 'day'}: ${ahead.map((b) => weekdayName(b).slice(0, 3)).join(' & ')}`;
    }
    if (k.summerIn !== undefined && k.summerIn <= 6) {
      return `${trying ? 'Fertile days' : 'Summer'} ${k.summerIn === 1 ? 'tomorrow' : `in ${k.summerIn} days`}`;
    }
  }
  if (k.periodIn && k.phase !== 'menstrual') return `Period ${rangeLabel(k.periodIn)}`;
  return undefined;
}

export function HimToday() {
  const k = useKairos();
  const { colors, dark } = useTheme();
  const s = useStore();
  const name = k.snapshot?.playbook.name || s.playbook.name || s.pairing.partnerName || '';
  const pal = seasonColors(k.season);

  const top = (
    <View style={styles.top}>
      <View style={{ flex: 1 }} />
      <IconButton
        icon="person"
        {...(name ? { text: name.trim().charAt(0).toUpperCase() } : {})}
        label={name ? `${name} and settings` : 'Her and settings'}
        onPress={() => router.push('/profile')}
      />
    </View>
  );

  if (!k.snapshot || k.snapshot.status === 'paused') {
    const paused = k.snapshot?.status === 'paused';
    return (
      <Screen>
        {top}
        <View style={[styles.hero, { marginTop: Space.xxxl }]}>
          <Orb season={undefined} size={170} dim />
        </View>
        <T variant="title" center>
          {paused ? 'Paused' : name ? `Waiting for ${name}` : 'Almost there'}
        </T>
        <T variant="callout" tone="secondary" center style={{ marginTop: Space.s }}>
          {paused ? 'Ideas return when she’s ready.' : 'Her seasons appear as soon as her cycle is in.'}
        </T>
        {!paused && s.pairing.status !== 'paired' ? (
          <Button
            label="Sync with her cycle"
            style={{ marginTop: Space.xxl }}
            onPress={() => router.push('/setup/him')}
          />
        ) : null}
      </Screen>
    );
  }

  const quiet = k.activeSignal?.response.quietUntil && Date.parse(k.activeSignal.response.quietUntil) > Date.now();
  const snoozed = s.history.find((h) => h.date === k.today && h.outcome === 'snoozed');
  const fact = nextUp(k);
  const assumed = k.assumed[k.assumed.length - 1];
  const log = (outcome: 'done' | 'skipped' | 'snoozed') =>
    k.todayNudge &&
    s.log({
      key: k.todayNudge.key,
      nudgeId: k.todayNudge.templateId,
      kind: k.todayNudge.kind,
      date: k.today,
      outcome,
      title: k.todayNudge.title,
    });

  return (
    <Screen season={k.season}>
      {top}

      <Press haptics={false} onPress={() => router.push('/rhythm')} accessibilityLabel="Her rhythm">
        <Animated.View entering={FadeIn.duration(900)} style={styles.hero}>
          <Orb season={k.season} size={188} />
        </Animated.View>
        <View style={styles.titleBlock}>
          <T variant="display" center>
            {name ? `${name}’s ` : 'Her '}
            <T variant="display" italic color={ink(pal.glow, dark)}>
              {k.copy?.name.toLowerCase() ?? 'season'}
            </T>
          </T>
          <T variant="body" tone="secondary" center>
            {k.copy?.brief}
          </T>
        </View>
        <View style={styles.strip}>
          <DayStrip days={k.snapshot.days} today={k.today} />
          {fact ? (
            <T variant="footnote" tone="secondary" center style={{ fontWeight: '600', marginTop: Space.xs }}>
              {fact}
            </T>
          ) : null}
        </View>
      </Press>

      <View style={{ gap: Space.m }}>
        {assumed ? (
          <Animated.View entering={FadeInDown.duration(400)}>
            <Glass radius={Radius.xl} style={styles.ask}>
              <T variant="headline" center>
                Did her period start around {aroundDay(assumed, k.today)}?
              </T>
              <View style={styles.askRow}>
                <Button
                  label="Yes"
                  compact
                  accent={pal.glow}
                  style={{ flex: 1 }}
                  onPress={() => {
                    haptic.success();
                    s.confirmPeriods(k.assumed);
                  }}
                />
                <Button label="Not yet" compact kind="secondary" style={{ flex: 1 }} onPress={s.notYet} />
                <Button
                  label="Other day"
                  compact
                  kind="secondary"
                  style={{ flex: 1 }}
                  onPress={() => router.push({ pathname: '/import', params: { mode: 'date', next: 'back' } })}
                />
              </View>
            </Glass>
          </Animated.View>
        ) : null}

        {k.recentHeart ? (
          <Animated.View entering={FadeInDown.duration(500)}>
            <Glass radius={Radius.l} style={styles.heart}>
              <Icon name="heart" size={16} color={ink(pal.glow, dark)} />
              <T variant="callout" style={{ flex: 1 }}>
                {name || 'She'} noticed{k.recentHeart.note ? `: “${k.recentHeart.note}”` : '.'}
              </T>
            </Glass>
          </Animated.View>
        ) : null}

        {k.activeSignal ? (
          <SignalCard
            signal={k.activeSignal}
            name={name || 'her'}
            season={k.season}
            onAck={() => s.acknowledge(k.activeSignal!.event.at)}
          />
        ) : null}

        {!quiet ? (
          <NudgeCard
            nudge={k.todayNudge}
            season={k.season}
            {...(k.doneToday ? { done: k.doneToday } : {})}
            snoozed={Boolean(snoozed)}
            onDone={() => log('done')}
            onSwap={() => log('skipped')}
            onSnooze={() => log('snoozed')}
            onUndo={() => {
              const entry = k.doneToday ?? snoozed;
              if (entry) s.undoLog(entry.key, entry.date);
            }}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', minHeight: 40 },
  hero: { alignItems: 'center', justifyContent: 'center', height: 214 },
  titleBlock: { alignItems: 'center', gap: Space.xs },
  strip: { marginTop: Space.xl, marginBottom: Space.xl, alignItems: 'center' },
  ask: { padding: Space.l, gap: Space.m },
  askRow: { flexDirection: 'row', gap: Space.s },
  heart: { flexDirection: 'row', alignItems: 'center', gap: Space.m, padding: Space.l },
});
