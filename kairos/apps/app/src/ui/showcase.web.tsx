import { addDays, localToday, PHASE_COPY } from '@kairos/core';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { useKairos } from '@/state/kairos';
import { useStore } from '@/state/store';

import { Button, Press } from './controls';
import { FrameContext } from './frame';
import { Icon, type IconName } from './icon';
import { T } from './text';
import { alpha, ink, phaseSeason, Radius, seasonColors, Space, useTheme } from './theme';

const PHONE_W = 393;
const PHONE_H = 852;
const BEZEL = 11;
const FRAME_INSETS = { top: 54, bottom: 26, left: 0, right: 0 };
const SCRUB_DAYS = 35;

/**
 * The desktop website: the pitch on the left, the real app running in a phone
 * on the right, and controls to flip between his phone and hers and to move
 * through her cycle. Below ~980px wide it steps aside and the app is the page.
 */
export function Showcase({ children }: { children: ReactNode }) {
  const { width, height } = useWindowDimensions();
  const { colors, dark } = useTheme();
  const { season } = useKairos();
  if (width < 980 || height < 620) return children;

  const scale = Math.min(1, (height - 64) / (PHONE_H + BEZEL * 2));
  const glow = seasonColors(season).glow;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View pointerEvents="none" style={[styles.wash, { backgroundColor: alpha(glow, dark ? 0.09 : 0.12) }]} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.left}>
        <Pitch />
      </ScrollView>
      <View style={[styles.right, { width: (PHONE_W + BEZEL * 2) * scale + 96 }]}>
        <View
          style={[
            styles.phone,
            {
              width: PHONE_W + BEZEL * 2,
              height: PHONE_H + BEZEL * 2,
              transform: [{ scale }],
              borderColor: dark ? '#221a1e' : '#1d1619',
              backgroundColor: colors.bg,
              boxShadow: `0 40px 120px ${alpha(glow, dark ? 0.28 : 0.35)}, 0 12px 40px rgba(0,0,0,0.35)`,
            },
          ]}>
          <FrameContext.Provider value={{ width: PHONE_W, height: PHONE_H }}>
            <SafeAreaInsetsContext.Provider value={FRAME_INSETS}>
              <View style={styles.screen}>{children}</View>
            </SafeAreaInsetsContext.Provider>
          </FrameContext.Provider>
          <StatusBarMock />
          <View pointerEvents="none" style={[styles.homeIndicator, { backgroundColor: colors.text }]} />
        </View>
      </View>
    </View>
  );
}

function StatusBarMock() {
  const { colors } = useTheme();
  const c = colors.text;
  return (
    <View pointerEvents="none" style={styles.status}>
      <T variant="headline" style={{ fontSize: 16, width: 90, textAlign: 'center' }} color={c}>
        9:41
      </T>
      <View style={styles.island} />
      <View style={styles.statusIcons}>
        <View style={styles.bars}>
          {[5, 7, 9, 11].map((h) => (
            <View key={h} style={{ width: 3, height: h, borderRadius: 1, backgroundColor: c }} />
          ))}
        </View>
        <View style={[styles.battery, { borderColor: alpha(c.startsWith('#') ? c : '#FFFFFF', 0.45) }]}>
          <View style={[styles.batteryFill, { backgroundColor: c }]} />
        </View>
      </View>
    </View>
  );
}

const PILLARS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'today',
    title: 'Timed to her seasons',
    body: 'One small, specific idea a day, shaped by where she is in her cycle and what she loves.',
  },
  {
    icon: 'heart',
    title: 'Never only then',
    body: 'Big gestures are spread across her whole cycle, so care never looks like a transaction.',
  },
  {
    icon: 'lock',
    title: 'Private by design',
    body: 'Her raw data never leaves her phone. What she shares is end-to-end encrypted.',
  },
];

function Pitch() {
  const s = useStore();
  const k = useKairos();
  const { colors, dark } = useTheme();
  const accent = seasonColors(k.season).glow;

  return (
    <View style={{ gap: Space.xxl, maxWidth: 560 }}>
      <View style={{ gap: Space.m }}>
        <T variant="display" style={{ fontSize: 72, lineHeight: 74 }}>
          Kairos
        </T>
        <T variant="title" italic tone="secondary">
          Her rhythm. Your moment.
        </T>
        <T variant="body" tone="secondary" style={{ fontSize: 18, lineHeight: 27, marginTop: Space.s }}>
          A private companion for couples. She shares as much of her cycle as she likes. He gets one small, specific
          idea a day, timed to her seasons, so he can be there before she has to ask.
        </T>
      </View>

      <View
        style={[styles.panel, { backgroundColor: alpha(colors.text, dark ? 0.05 : 0.04), borderColor: colors.border }]}>
        {s.demo ? (
          <>
            <T variant="caption" tone="tertiary">
              Try it live · a simulated couple, Maya and Alex
            </T>
            <View style={{ flexDirection: 'row', gap: Space.s }}>
              {(['him', 'her'] as const).map((r) => (
                <Button
                  key={r}
                  compact
                  label={r === 'him' ? 'His phone' : 'Her phone'}
                  kind={s.role === r ? 'primary' : 'secondary'}
                  onPress={() => {
                    s.setRole(r);
                    router.replace(r === 'him' ? '/him' : '/her');
                  }}
                />
              ))}
            </View>
            <Scrubber />
          </>
        ) : (
          <>
            <T variant="headline">See both sides of it</T>
            <T variant="callout" tone="secondary">
              Open the demo to flip between his phone and hers, and to move through a whole cycle.
            </T>
            <View style={{ flexDirection: 'row' }}>
              <Button
                label="Open the demo"
                icon="sparkles"
                accent={accent}
                onPress={() => {
                  s.startDemo('him');
                  router.replace('/him');
                }}
              />
            </View>
          </>
        )}
      </View>

      <View style={{ gap: Space.l }}>
        {PILLARS.map((p) => (
          <View key={p.title} style={styles.pillar}>
            <View style={[styles.pillarIcon, { backgroundColor: alpha(accent, 0.15) }]}>
              <Icon name={p.icon} size={17} color={ink(accent, dark)} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="headline">{p.title}</T>
              <T variant="callout" tone="secondary">
                {p.body}
              </T>
            </View>
          </View>
        ))}
      </View>

      <T variant="footnote" tone="tertiary">
        One codebase for iPhone, Android and the web. A working prototype: fertility estimates support timing and are
        not birth control.
      </T>
    </View>
  );
}

/** A strip of her next five weeks, colored by season. Click a day to jump there. */
function Scrubber() {
  const s = useStore();
  const k = useKairos();
  const { colors } = useTheme();
  const realToday = localToday();
  const byDate = new Map((k.forecast?.days ?? []).map((d) => [d.date, d]));
  const selected = addDays(realToday, s.dayOffset);
  const phase = byDate.get(selected)?.phase;

  return (
    <View style={{ gap: Space.s }}>
      <View style={styles.scrubRow}>
        {Array.from({ length: SCRUB_DAYS }, (_, i) => {
          const date = addDays(realToday, i);
          const d = byDate.get(date);
          const pal = seasonColors(phaseSeason(d?.phase));
          const on = i === s.dayOffset;
          return (
            <Press
              key={date}
              haptics={false}
              accessibilityLabel={`Jump to ${date}`}
              onPress={() => s.travel(i)}
              style={[
                styles.scrubCell,
                { backgroundColor: d ? pal.from : alpha(colors.text, 0.1) },
                on ? { transform: [{ scaleY: 1.5 }], borderColor: colors.text, borderWidth: 1.5 } : null,
              ]}>
              {d?.peak ? <View style={styles.peak} /> : null}
            </Press>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T variant="footnote" tone="secondary">
          {s.dayOffset === 0
            ? 'Today'
            : new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
              })}
          {phase ? ` · ${PHASE_COPY[phase].name}` : ''}
        </T>
        {s.dayOffset !== 0 ? (
          <Press onPress={() => s.travel(0)} accessibilityLabel="Back to today">
            <T variant="label" tone="secondary">
              Back to today
            </T>
          </Press>
        ) : (
          <T variant="footnote" tone="tertiary">
            Click a day
          </T>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  wash: {
    position: 'absolute',
    top: -200,
    right: -200,
    width: 900,
    height: 900,
    borderRadius: 450,
    filter: 'blur(120px)',
  },
  left: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 72, paddingVertical: 56 },
  right: { alignItems: 'center', justifyContent: 'center', paddingRight: 48 },
  phone: { borderWidth: BEZEL, borderRadius: 64, overflow: 'hidden' },
  screen: { width: PHONE_W, height: PHONE_H, overflow: 'hidden', position: 'relative' },
  status: {
    position: 'absolute',
    top: BEZEL + 14,
    left: BEZEL,
    right: BEZEL,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    zIndex: 100,
  },
  island: { width: 124, height: 36, borderRadius: 18, backgroundColor: '#000000' },
  statusIcons: { width: 90, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  battery: { width: 26, height: 13, borderRadius: 4, borderWidth: 1, padding: 1.5 },
  batteryFill: { flex: 1, borderRadius: 2 },
  homeIndicator: {
    position: 'absolute',
    bottom: BEZEL + 8,
    alignSelf: 'center',
    width: 134,
    height: 5,
    borderRadius: 3,
    opacity: 0.85,
    zIndex: 100,
  },
  panel: { borderRadius: Radius.xl, borderWidth: 1, padding: Space.xl, gap: Space.l },
  pillar: { flexDirection: 'row', gap: Space.l, alignItems: 'flex-start' },
  pillarIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  scrubRow: { flexDirection: 'row', gap: 3, alignItems: 'center', height: 30 },
  scrubCell: { flex: 1, height: 20, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  peak: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#FFFFFF' },
});
