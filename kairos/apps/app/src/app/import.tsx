import {
  addDays,
  diffDays,
  localToday,
  readCalendarImage,
  type CalendarReading,
  type ISODate,
  type PeriodLog,
  type Pixels,
} from '@kairos/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { haptic } from '@/platform/haptics';
import { configureNotifications } from '@/platform/notifications';
import { deviceHints, pickScreenshot } from '@/platform/screenshot';
import { useStore } from '@/state/store';
import { Button, IconButton, Press } from '@/ui/controls';
import { Icon } from '@/ui/icon';
import { MonthGrid, monthName } from '@/ui/month-grid';
import { Orb } from '@/ui/orb';
import { Screen } from '@/ui/screen';
import { T } from '@/ui/text';
import { alpha, Radius, seasonColors, Space, useTheme } from '@/ui/theme';

type Mode = 'screenshot' | 'date';
type Next = 'today' | 'share' | 'back';

const monthFirst = (d: ISODate): ISODate => `${d.slice(0, 8)}01`;
const accent = seasonColors('winter').glow;

/** Consecutive marked days become one period. A run that reaches today is still going. */
function toPeriods(marked: ReadonlySet<ISODate>, today: ISODate): PeriodLog[] {
  const out: PeriodLog[] = [];
  let run: ISODate[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const start = run[0]!;
    const end = run[run.length - 1]!;
    out.push(run.length === 1 || end >= today ? { start } : { start, end });
    run = [];
  };
  for (const d of [...marked].filter((x) => x <= today).sort()) {
    if (run.length && diffDays(run[run.length - 1]!, d) !== 1) flush();
    run.push(d);
  }
  flush();
  return out;
}

/**
 * One screen for getting her cycle in: read it from a screenshot of any
 * tracker's calendar, or tap the day her last period started. Either way the
 * result is shown as a calendar that can be corrected with a tap.
 */
export default function Import() {
  const params = useLocalSearchParams<{ mode?: Mode; next?: Next }>();
  const mode: Mode = params.mode === 'date' ? 'date' : 'screenshot';
  const next: Next = params.next ?? 'back';
  const s = useStore();
  const { colors } = useTheme();
  const him = s.role !== 'her';
  const today = localToday();
  const hints = useMemo(deviceHints, []);

  const [phase, setPhase] = useState<'intro' | 'reading' | 'review' | 'failed'>(mode === 'date' ? 'review' : 'intro');
  const [marked, setMarked] = useState<ReadonlySet<ISODate>>(new Set());
  const [soft, setSoft] = useState<ReadonlySet<ISODate>>(new Set());
  const [months, setMonths] = useState<ISODate[]>(
    mode === 'date' ? [monthFirst(addDays(monthFirst(today), -1)), monthFirst(today)] : [],
  );
  const [weekStart, setWeekStart] = useState<number>(hints.weekStart ?? 0);
  const [last, setLast] = useState<{ pixels: Pixels; reading: CalendarReading }>();
  const [name, setName] = useState(s.playbook.name);
  const [length, setLength] = useState(s.cycle.statedCycleLength ?? 28);

  const periods = toPeriods(marked, today);
  const known = s.cycle.periods.length + periods.length;

  const show = (reading: CalendarReading, pixels: Pixels, replace: boolean) => {
    if (reading.status === 'not-found') {
      setPhase(months.length && !replace ? 'review' : 'failed');
      return;
    }
    const period = reading.days.filter((d) => d.mark === 'period').map((d) => d.date);
    const predicted = reading.days.filter((d) => d.mark === 'predicted').map((d) => d.date);
    const drop = replace && last ? new Set(last.reading.days.map((d) => d.date)) : new Set<ISODate>();
    const dropMonths = replace && last ? new Set(last.reading.months) : new Set<ISODate>();
    setMarked((prev) => new Set([...[...prev].filter((d) => !drop.has(d)), ...period]));
    setSoft((prev) => new Set([...[...prev].filter((d) => !drop.has(d)), ...predicted]));
    setMonths((prev) =>
      [...new Set([...prev.filter((m) => !dropMonths.has(m)), ...reading.months])]
        .filter((m) => m <= today)
        .sort()
        .slice(-4),
    );
    if (reading.weekStart !== undefined) setWeekStart(reading.weekStart);
    if (reading.cycleLength) setLength(reading.cycleLength);
    setLast({ pixels, reading });
    setPhase('review');
    if (period.length) haptic.success();
  };

  const read = (pixels: Pixels, firstMonth?: ISODate) => {
    setPhase('reading');
    // Let the "reading" state paint before the reader takes the thread for a second or two.
    setTimeout(() => {
      try {
        show(
          readCalendarImage(pixels, { today, ...hints, ...(firstMonth ? { firstMonth } : {}) }),
          pixels,
          !!firstMonth,
        );
      } catch {
        setPhase('failed');
      }
    }, 80);
  };

  const choose = async () => {
    try {
      const pixels = await pickScreenshot();
      if (pixels) read(pixels);
    } catch {
      setPhase('failed');
    }
  };

  const toggle = (date: ISODate) => {
    haptic.tap();
    if (mode === 'date') {
      setMarked(new Set(marked.has(date) ? [] : [date]));
      return;
    }
    const copy = new Set(marked);
    if (copy.has(date)) copy.delete(date);
    else copy.add(date);
    setMarked(copy);
  };

  const finish = () => {
    if (periods.length === 0) return;
    if (him && name.trim() !== s.playbook.name) s.updatePlaybook({ name: name.trim() });
    s.addPeriods(periods, mode === 'date' ? 'manual' : 'screenshot', known < 2 ? length : undefined);
    haptic.success();
    if (next === 'share') router.replace('/setup/share');
    else if (next === 'today') {
      s.finishOnboarding();
      configureNotifications().catch(() => {});
      router.dismissTo('/today');
    } else router.back();
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/today'));
  const whose = him ? 'her' : 'your';

  if (phase === 'intro' || phase === 'failed') {
    return (
      <Screen season="winter" footer={<Button label="Choose a screenshot" icon="photo" onPress={choose} />}>
        <View style={styles.back}>
          <IconButton icon="back" label="Back" onPress={back} />
        </View>
        <T variant="title" style={styles.title}>
          {phase === 'failed' ? 'That didn’t look like a calendar.' : `Add ${whose} cycle calendar.`}
        </T>
        <T variant="callout" tone="secondary" style={{ marginTop: Space.s }}>
          {phase === 'failed'
            ? 'Use a screenshot of the month view, numbers and all.'
            : 'Any period app works. It is read on this phone and goes nowhere.'}
        </T>
        <View style={styles.steps}>
          {(
            [
              ['day', `Open the month view in ${him ? 'her' : 'your'} app`],
              ['photo', 'Take a screenshot'],
              ['check', 'Choose it here'],
            ] as const
          ).map(([icon, label], i) => (
            <View key={label} style={styles.step}>
              <View style={[styles.stepIcon, { backgroundColor: alpha(accent, 0.16) }]}>
                <Icon name={icon} size={20} color={colors.text} />
              </View>
              <T variant="callout" style={{ flex: 1 }}>
                {label}
              </T>
              <T variant="footnote" tone="tertiary">
                {i + 1}
              </T>
            </View>
          ))}
        </View>
        {phase === 'failed' ? (
          <Press
            onPress={() => router.replace({ pathname: '/import', params: { mode: 'date', next } })}
            style={{ marginTop: Space.xl, alignSelf: 'center' }}
            accessibilityLabel="Pick a date instead">
            <T variant="label" tone="secondary">
              Pick a date instead
            </T>
          </Press>
        ) : null}
      </Screen>
    );
  }

  if (phase === 'reading') {
    return (
      <Screen season="winter" scroll={false}>
        <View style={styles.reading}>
          <Orb season="winter" size={150} breath={2.4} />
          <T variant="title2" center style={{ marginTop: Space.xxl }}>
            Reading…
          </T>
        </View>
      </Screen>
    );
  }

  const found = periods.length;
  const alternatives =
    mode === 'screenshot' && months.length === (last?.reading.months.length ?? 0)
      ? last?.reading.alternatives
      : undefined;
  const title =
    mode === 'date'
      ? `When did ${whose} last period start?`
      : found
        ? `Found ${found} period${found === 1 ? '' : 's'}.`
        : 'No period on this screen.';
  const subtitle =
    mode === 'date'
      ? 'Tap the first day.'
      : found
        ? 'Tap a day to fix anything.'
        : 'Tap the days it happened, or add the month that shows it.';

  return (
    <Screen
      season="winter"
      footer={
        <>
          <Button label={mode === 'date' ? 'Continue' : 'Looks right'} disabled={found === 0} onPress={finish} />
          {mode === 'screenshot' ? <Button label="Add another month" kind="ghost" onPress={choose} /> : null}
        </>
      }>
      <View style={styles.back}>
        <IconButton icon="back" label="Back" onPress={back} />
      </View>
      <Animated.View entering={FadeIn.duration(400)}>
        <T variant="title" style={styles.title}>
          {title}
        </T>
        <T variant="callout" tone="secondary" style={{ marginTop: Space.s }}>
          {subtitle}
        </T>
      </Animated.View>

      {alternatives?.length ? (
        <View style={styles.alternatives}>
          <T variant="footnote" tone="tertiary">
            Not {monthName(months[0]!)}?
          </T>
          {alternatives.map((alt) => (
            <Press
              key={alt}
              onPress={() => last && read(last.pixels, alt)}
              accessibilityLabel={`It is ${monthName(alt, true)}`}
              style={[styles.alt, { backgroundColor: alpha(colors.text, 0.07) }]}>
              <T variant="label">{monthName(alt, alt.slice(0, 4) !== today.slice(0, 4))}</T>
            </Press>
          ))}
        </View>
      ) : null}

      <View style={{ gap: Space.xl, marginTop: Space.xl }}>
        {months.map((m) => (
          <MonthGrid
            key={m}
            month={m}
            weekStart={weekStart}
            today={today}
            marked={marked}
            soft={soft}
            onPress={toggle}
            accent={accent}
          />
        ))}
      </View>

      {known < 2 ? (
        <View style={[styles.row, { borderColor: colors.hairline }]}>
          <T variant="callout" style={{ flex: 1 }}>
            Usual cycle
          </T>
          <IconButton icon="minus" label="Shorter" size={34} onPress={() => setLength((v) => Math.max(21, v - 1))} />
          <T variant="headline" style={styles.length}>
            {length} days
          </T>
          <IconButton icon="plus" label="Longer" size={34} onPress={() => setLength((v) => Math.min(40, v + 1))} />
        </View>
      ) : null}

      {him && next === 'today' ? (
        <View style={[styles.row, { borderColor: colors.hairline }]}>
          <T variant="callout">Her name</T>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Optional"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="done"
            style={[styles.name, { color: colors.text }]}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { marginLeft: -8, marginBottom: Space.xl },
  title: { fontSize: 36, lineHeight: 39 },
  steps: { marginTop: Space.xxl, gap: Space.m },
  step: { flexDirection: 'row', alignItems: 'center', gap: Space.l },
  stepIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  reading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  alternatives: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Space.s, marginTop: Space.l },
  alt: { height: 32, paddingHorizontal: 14, borderRadius: Radius.pill, justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.m,
    minHeight: 56,
    marginTop: Space.l,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  length: { minWidth: 76, textAlign: 'center', fontVariant: ['tabular-nums'] },
  name: { flex: 1, textAlign: 'right', fontSize: 17, height: 48 },
});
