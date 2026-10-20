import type { Season } from '@kairos/core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStore } from '@/state/store';
import { Button, Press } from '@/ui/controls';
import { Icon } from '@/ui/icon';
import { Orb } from '@/ui/orb';
import { T } from '@/ui/text';
import { MaxWidth, Space, useTheme } from '@/ui/theme';

const CYCLE: Season[] = ['winter', 'spring', 'summer', 'autumn'];

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const startDemo = useStore((s) => s.startDemo);
  const setRole = useStore((s) => s.setRole);
  const [i, setI] = useState(1);

  useEffect(() => {
    const id = setInterval(() => setI((x) => (x + 1) % CYCLE.length), 3600);
    return () => clearInterval(id);
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg, paddingTop: insets.top + Space.xxl, paddingBottom: insets.bottom + Space.xl }]}>
      <View style={styles.column}>
        <Animated.View entering={FadeIn.duration(1200)} style={styles.hero}>
          <Orb season={CYCLE[i]} size={210} />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(250).duration(700)} style={{ gap: Space.m, alignItems: 'center' }}>
          <T variant="display" center style={{ fontSize: 56, lineHeight: 60 }}>
            Kairos
          </T>
          <T variant="title2" italic center tone="secondary">
            Her rhythm. Your moment.
          </T>
          <T variant="callout" tone="tertiary" center style={{ maxWidth: 330, marginTop: Space.xs }}>
            A quiet companion that helps him be there before she has to ask. Private by design.
          </T>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(500).duration(700)} style={styles.actions}>
          <Button
            label="I track my cycle"
            onPress={() => {
              setRole('her');
              router.push('/onboarding/her');
            }}
          />
          <Button
            label="I’m her partner"
            kind="secondary"
            onPress={() => {
              setRole('him');
              router.push('/onboarding/him');
            }}
          />
          <Press
            onPress={() => {
              startDemo('him');
              router.replace('/him');
            }}
            style={styles.demo}
            accessibilityLabel="Explore the demo">
            <Icon name="sparkles" size={14} color={colors.textSecondary} />
            <T variant="label" tone="secondary">
              Explore the demo
            </T>
          </Press>
          <View style={styles.privacy}>
            <Icon name="lock" size={11} color={colors.textTertiary} />
            <T variant="footnote" tone="tertiary">
              End-to-end encrypted. We can’t read her data. No one can.
            </T>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: MaxWidth, paddingHorizontal: Space.xl, justifyContent: 'space-between' },
  hero: { alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 260 },
  actions: { gap: Space.m, paddingTop: Space.xxl },
  demo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 40 },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: Space.l },
});
