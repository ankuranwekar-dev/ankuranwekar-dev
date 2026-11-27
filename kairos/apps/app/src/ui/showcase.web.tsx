import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { useKairos } from '@/state/kairos';

import { FrameContext } from './frame';
import { Icon, type IconName } from './icon';
import { T } from './text';
import { alpha, ink, seasonColors, Space, useTheme } from './theme';

const PHONE_W = 393;
const PHONE_H = 852;
const BEZEL = 11;
const FRAME_INSETS = { top: 54, bottom: 26, left: 0, right: 0 };

/**
 * The desktop website: the pitch on the left and the real app running in a phone
 * on the right. Below ~980px wide it steps aside and the app is the page.
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
    icon: 'photo',
    title: 'Works with any period app',
    body: 'A photo or screenshot of her calendar is enough. It is read on the phone and goes nowhere.',
  },
  {
    icon: 'today',
    title: 'One idea a day',
    body: 'Small and specific, timed to her season. Done in a tap.',
  },
  {
    icon: 'lock',
    title: 'Private by design',
    body: 'No account. Her data stays on the phone; anything shared is end-to-end encrypted.',
  },
];

function Pitch() {
  const k = useKairos();
  const { dark } = useTheme();
  const accent = seasonColors(k.season).glow;

  return (
    <View style={{ gap: Space.xxl, maxWidth: 560 }}>
      <View style={{ gap: Space.m }}>
        <T variant="display" style={{ fontSize: 72, lineHeight: 74 }}>
          Tender
        </T>
        <T variant="title" italic tone="secondary">
          Her rhythm. Your moment.
        </T>
        <T variant="body" tone="secondary" style={{ fontSize: 18, lineHeight: 27, marginTop: Space.s }}>
          Tender turns her cycle into four seasons, and gives him one small thing to do each day so he is there before
          she has to ask.
        </T>
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
  pillar: { flexDirection: 'row', gap: Space.l, alignItems: 'flex-start' },
  pillarIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
