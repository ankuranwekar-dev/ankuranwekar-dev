import { addDays, diffDays, localToday, type CalendarReading, type ISODate, type PeriodLog } from '@kairos/core';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { haptic } from '@/platform/haptics';
import { configureNotifications } from '@/platform/notifications';
import { sampleAvailable, sampleCalendar } from '@/platform/sample';
import { readPicked, readPixels, type ReadSession } from '@/platform/calendar-reader';
import { DEV_READ, devPhotoUri } from '@/platform/dev';
import { photoReaderAvailable } from '@/platform/photo';
import { CameraDenied, deviceHints, pick, type Picked } from '@/platform/screenshot';
import { useStore } from '@/state/store';
import { Button, IconButton, Press } from '@/ui/controls';
import { Icon, type IconName } from '@/ui/icon';
import { MonthGrid, monthName } from '@/ui/month-grid';
import { Orb } from '@/ui/orb';
import { Screen } from '@/ui/screen';
import { T } from '@/ui/text';
import { alpha, Radius, seasonColors, Space, useTheme } from '@/ui/theme';

type Mode = 'screenshot' | 'date';
type Trouble = 'camera' | 'no-text' | 'no-grid' | 'other';
type Next = 'today' | 'share' | 'back';

const monthFirst = (d: ISODate): ISODate => `${d.slice(0, 8)}01`;
const accent = seasonColors('winter').glow;

const TROUBLE: Record<Trouble, { title: string; hint: string }> = {
  camera: { title: 'Tender needs the camera.', hint: 'Allow it in Settings, or choose a photo you already have.' },
  'no-text': {
    title: 'I couldn’t read any text.',
    hint: 'Move closer, hold steady, and make sure the screen is bright. Or take a screenshot instead.',
  },
  'no-grid': {
    title: 'I couldn’t find a month.',
    hint: 'Fit one month’s dates in the frame, straight on and without glare. A screenshot works too.',
  },
  other: {
    title: 'That didn’t look like a calendar.',
    hint: 'Use a photo or screenshot of the month view, numbers and all.',
  },
};

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
  const params = useLocalSearchParams<{
    mode?: Mode;
    next?: Next;
    file?: string;
    today?: string;
    pick?: string;
    name?: string;
    finish?: string;
  }>();
  const mode: Mode = params.mode === 'date' ? 'date' : 'screenshot';
  const next: Next = params.next ?? 'back';
  const s = useStore();
  const { colors } = useTheme();
  const him = s.role !== 'her';
  const today = (DEV_READ && params.today ? params.today : localToday()) as ISODate;
  const hints = useMemo(deviceHints, []);

  const [phase, setPhase] = useState<'intro' | 'reading' | 'review' | 'failed'>(mode === 'date' ? 'review' : 'intro');
  const [marked, setMarked] = useState<ReadonlySet<ISODate>>(new Set());
  const [soft, setSoft] = useState<ReadonlySet<ISODate>>(new Set());
  const [months, setMonths] = useState<ISODate[]>(
    mode === 'date' ? [monthFirst(addDays(monthFirst(today), -1)), monthFirst(today)] : [],
  );
  const [weekStart, setWeekStart] = useState<number>(hints.weekStart ?? 0);
  const [last, setLast] = useState<{ session: ReadSession; reading: CalendarReading; picture?: string }>();
  const [trouble, setTrouble] = useState<Trouble>('other');
  const [name, setName] = useState(s.playbook.name);
  const [length, setLength] = useState(s.cycle.statedCycleLength ?? 28);

  const periods = toPeriods(marked, today);
  const known = s.cycle.periods.length + periods.length;

  const show = (session: ReadSession, replace: boolean, uri?: string) => {
    const { reading } = session;
    if (reading.status === 'not-found') {
      // Say what went wrong, so the next picture can be better.
      setTrouble(session.failure === 'no-text' ? 'no-text' : session.failure === 'no-grid' ? 'no-grid' : 'other');
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
    // A re-read of the same picture keeps it; a new one (another month) replaces it.
    const shown = uri ?? (replace ? last?.picture : undefined);
    setLast({ session, reading, ...(shown ? { picture: shown } : {}) });
    setPhase('review');
    if (period.length) haptic.success();
  };

  const read = (run: () => Promise<ReadSession>, replace: boolean, uri?: string) => {
    setPhase('reading');
    // Let the "reading" state paint before the reader takes the thread for a second or two.
    setTimeout(() => {
      run()
        .then((session) => show(session, replace, uri))
        .catch(() => {
          setTrouble('other');
          setPhase('failed');
        });
    }, 80);
  };

  const choose = async (source: 'library' | 'camera') => {
    let picked: Picked | null;
    try {
      picked = await pick(source);
    } catch (e) {
      setTrouble(e instanceof CameraDenied ? 'camera' : 'other');
      setPhase('failed');
      return;
    }
    if (picked)
      read(() => readPicked(picked, { today, ...hints }), false, picked.kind === 'screenshot' ? undefined : picked.uri);
  };

  const reread = (firstMonth: ISODate) => {
    if (last) read(async () => last.session.reread(firstMonth), true);
  };

  // Developer check only (see platform/dev.ts): open straight onto a photo that is already on the phone.
  const devFile = DEV_READ ? params.file : undefined;
  useEffect(() => {
    if (!devFile) return;
    const uri = devPhotoUri(devFile);
    read(() => readPicked({ uri, width: 0, height: 0, kind: 'photo' }, { today, ...hints }), false, uri);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devFile]);

  // Developer check only: mark days, give her a name and finish, so the screens after setup can be reached and
  // captured on a device without anyone tapping through it.
  useEffect(() => {
    if (!DEV_READ) return;
    if (params.pick) setMarked(new Set(params.pick.split(',') as ISODate[]));
    if (params.name) setName(params.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const devFinish = DEV_READ && params.finish === '1';
  useEffect(() => {
    if (devFinish && phase === 'review' && periods.length > 0) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devFinish, phase, periods.length]);

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
      // His phone sets notifications up from the background effect once Today has settled (calling it here as
      // well started two identical calls within milliseconds of each other, at the busiest moment).
      if (!him) configureNotifications().catch(() => {});
      router.dismissTo('/today');
    } else router.back();
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/today'));
  const whose = him ? 'her' : 'your';

  if (phase === 'intro' || phase === 'failed') {
    return (
      <Screen
        season="winter"
        footer={
          <>
            {photoReaderAvailable ? (
              <>
                <Button label="Take a photo" icon="camera" onPress={() => choose('camera')} />
                <Button
                  label="Choose a photo or screenshot"
                  icon="photo"
                  kind="secondary"
                  onPress={() => choose('library')}
                />
              </>
            ) : (
              <Button label="Choose a screenshot" icon="photo" onPress={() => choose('library')} />
            )}
            {sampleAvailable ? (
              <Button
                label="Try with a sample"
                kind="ghost"
                onPress={() => {
                  const pixels = sampleCalendar(today);
                  if (pixels) read(async () => readPixels(pixels, { today, ...hints }), false);
                }}
              />
            ) : null}
          </>
        }>
        <View style={styles.back}>
          <IconButton icon="back" label="Back" onPress={back} />
        </View>
        <T variant="title" style={styles.title}>
          {phase === 'failed' ? TROUBLE[trouble].title : `Add ${whose} cycle calendar.`}
        </T>
        <T variant="callout" tone="secondary" style={{ marginTop: Space.s }}>
          {phase === 'failed'
            ? TROUBLE[trouble].hint
            : 'Any period app works. It is read on this phone and goes nowhere.'}
        </T>
        <View style={styles.steps}>
          {(
            [
              ['day', `Open the month view in ${him ? 'her' : 'your'} app`],
              photoReaderAvailable
                ? ['camera', 'Photograph the screen, or take a screenshot']
                : ['photo', 'Take a screenshot'],
              ['check', 'Check what Tender found'],
            ] satisfies [IconName, string][]
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
        {photoReaderAvailable ? (
          <T variant="footnote" tone="tertiary" style={{ marginTop: Space.xl }}>
            For a photo: hold the phone straight on, fill the frame with one month, keep glare off the screen, and wait
            for it to focus.
          </T>
        ) : null}
        {phase === 'failed' && trouble === 'camera' ? (
          <Press
            onPress={() => Linking.openSettings().catch(() => {})}
            style={{ marginTop: Space.xl, alignSelf: 'center' }}
            accessibilityLabel="Open Settings">
            <T variant="label" tone="secondary">
              Open Settings
            </T>
          </Press>
        ) : null}
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
  const photographed = last?.session.via === 'text';
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
        ? photographed
          ? last?.session.cropped
            ? 'Part of the calendar was outside the photo. Check the days at the edges, and tap one to fix it.'
            : 'Check each day against her screen. Tap one to fix it.'
          : 'Tap a day to fix anything.'
        : 'Tap the days it happened, or add the month that shows it.';

  return (
    <Screen
      season="winter"
      footer={
        <>
          <Button label={mode === 'date' ? 'Continue' : 'Looks right'} disabled={found === 0} onPress={finish} />
          {mode === 'screenshot' ? (
            <Button
              label="Add another month"
              kind="ghost"
              onPress={() => choose(photographed ? 'camera' : 'library')}
            />
          ) : null}
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
              onPress={() => reread(alt)}
              accessibilityLabel={`It is ${monthName(alt, true)}`}
              style={[styles.alt, { backgroundColor: alpha(colors.text, 0.07) }]}>
              <T variant="label">{monthName(alt, alt.slice(0, 4) !== today.slice(0, 4))}</T>
            </Press>
          ))}
        </View>
      ) : null}

      {last?.picture ? (
        <View style={styles.photo}>
          <Image
            source={{ uri: last.picture }}
            style={styles.thumb}
            contentFit="cover"
            accessibilityLabel="Your photo"
          />
          <T variant="footnote" tone="tertiary" style={{ flex: 1 }}>
            Your photo, for comparing. Nothing here is saved or sent anywhere.
          </T>
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
  photo: { flexDirection: 'row', alignItems: 'center', gap: Space.m, marginTop: Space.l },
  thumb: { width: 64, height: 86, borderRadius: Radius.s },
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
