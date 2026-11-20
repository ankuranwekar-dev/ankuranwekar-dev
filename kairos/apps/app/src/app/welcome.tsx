import type { Season } from '@kairos/core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { relayConfigured } from '@/platform/relay';
import { useStore } from '@/state/store';
import { Button } from '@/ui/controls';
import { useScreenSize } from '@/ui/frame';
import { Orb } from '@/ui/orb';
import { T } from '@/ui/text';
import { ink, MaxWidth, seasonColors, Space, useTheme } from '@/ui/theme';

const CYCLE: Season[] = ['spring', 'summer', 'autumn', 'winter'];

/** The first thing anyone sees: the orb turning through her four seasons, one line, two ways in. */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  const { colors, dark } = useTheme();
  const { height } = useScreenSize();
  const setRole = useStore((s) => s.setRole);
  const [i, setI] = useState(0);
  const season = CYCLE[i]!;

  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % CYCLE.length), 3200);
    return () => clearInterval(id);
  }, []);

  const orb = Math.min(250, Math.max(170, height * 0.28));

  // A ScrollView whose content is at least as tall as the screen: at normal text sizes it looks and behaves
  // as before (hero fills the gap, actions sit at the bottom); at the largest accessibility sizes the content
  // grows past the screen and scrolls, so the buttons stay reachable instead of being pushed off.
  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={[
        styles.root,
        { paddingTop: insets.top + Space.l, paddingBottom: insets.bottom + Space.l },
      ]}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}>
      <View style={styles.column}>
        <Animated.View entering={FadeIn.duration(900)}>
          <T variant="caption" tone="tertiary" center style={{ letterSpacing: 3 }}>
            Tender
          </T>
        </Animated.View>

        <View style={styles.hero}>
          <View style={{ width: orb, height: orb }}>
            <Animated.View
              key={season}
              entering={FadeIn.duration(1300)}
              exiting={FadeOut.duration(1300)}
              style={StyleSheet.absoluteFill}>
              <Orb season={season} size={orb} />
            </Animated.View>
          </View>
          <Animated.View key={`w-${season}`} entering={FadeIn.duration(900)} exiting={FadeOut.duration(500)}>
            {/* Capped so "her autumn" never wraps: the word changes every few seconds and a wrap would move the buttons. */}
            <T
              variant="title2"
              italic
              center
              maxFontSizeMultiplier={1.5}
              color={ink(seasonColors(season).glow, dark)}
              style={{ marginTop: Space.xl }}>
              her {season}
            </T>
          </Animated.View>
        </View>

        <Animated.View entering={FadeInDown.delay(200).duration(700)} style={{ gap: Space.s }}>
          {/* Capped so "rhythm." still fits on one line at the largest text size; everything else scales fully. */}
          <T variant="display" center maxFontSizeMultiplier={1.3} style={{ fontSize: 40, lineHeight: 45 }}>
            Her rhythm.{'\n'}Your moment.
          </T>
          <T variant="callout" tone="secondary" center>
            One small idea a day, timed to her cycle.
          </T>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(400).duration(700)} style={styles.actions}>
          <Button
            label="I’m her partner"
            onPress={() => {
              setRole('him');
              router.push('/setup/him');
            }}
          />
          {relayConfigured ? (
            <Button
              label="I track my cycle"
              kind="secondary"
              onPress={() => {
                setRole('her');
                router.push('/setup/her');
              }}
            />
          ) : null}
        </Animated.View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, alignItems: 'center' },
  column: { flexGrow: 1, width: '100%', maxWidth: MaxWidth, paddingHorizontal: Space.xl },
  hero: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', minHeight: 240 },
  actions: { gap: Space.s, paddingTop: Space.xxl },
});
