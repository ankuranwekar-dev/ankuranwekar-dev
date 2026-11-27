import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { configureNotifications } from '@/platform/notifications';
import { useKairos } from '@/state/kairos';
import { useStore } from '@/state/store';
import { clockLabel } from '@/ui/clock';
import { Button } from '@/ui/controls';
import { Icon, type IconName } from '@/ui/icon';
import { Orb } from '@/ui/orb';
import { Screen } from '@/ui/screen';
import { T } from '@/ui/text';
import { alpha, ink, seasonColors, Space, useTheme } from '@/ui/theme';

/**
 * The end of setup. Setup used to drop him straight onto Today with a permission prompt arriving a moment later and
 * nothing said about what the app is or what to do with it. This is the pause in between: what Tender now knows, what
 * will happen, what he has to do (almost nothing), and the one question that needs his answer, asked in context.
 */
export default function Ready() {
  const k = useKairos();
  const s = useStore();
  const { colors, dark } = useTheme();
  const [busy, setBusy] = useState(false);
  const name = (s.playbook.name || s.pairing.partnerName || '').trim();
  const possessive = name ? `${name}’s` : 'her';
  const pal = seasonColors(k.season);
  const native = Platform.OS !== 'web';
  const time = clockLabel(s.prefs.notifyAt);

  const finish = async (allow: boolean) => {
    if (busy) return;
    setBusy(true);
    if (allow) await configureNotifications(true).catch(() => false);
    // Leave setup behind entirely: from here Today is the app, and there is nothing to go back to.
    if (router.canDismiss()) router.dismissAll();
    router.replace('/today');
  };

  const rows: { icon: IconName; title: string; body: string }[] = [
    {
      icon: 'sun',
      title: k.copy ? `Right now: ${possessive} ${k.copy.name.toLowerCase()}` : `${possessive} cycle is in`,
      body: k.copy
        ? `${k.copy.brief} Seasons are Tender’s names for her cycle.`
        : 'Seasons are Tender’s names for her cycle.',
    },
    {
      icon: 'bell',
      title: `An idea most mornings, at ${time}`,
      body: 'Small and doable. Nothing on your lock screen mentions her cycle.',
    },
    {
      icon: 'check',
      title: 'Do it, then tap “I did it”',
      body: 'That’s all. You can close the app.',
    },
  ];

  return (
    <Screen
      season={k.season}
      footer={
        <>
          <Button
            label={native ? 'Turn on morning ideas' : 'Show me today'}
            icon={native ? 'bell' : undefined}
            accent={pal.glow}
            disabled={busy}
            onPress={() => finish(native)}
          />
          {native ? <Button label="Not now" kind="ghost" disabled={busy} onPress={() => finish(false)} /> : null}
        </>
      }>
      <Animated.View entering={FadeIn.duration(700)} style={styles.hero}>
        <Orb season={k.season} size={120} />
      </Animated.View>
      <Animated.View entering={FadeInDown.delay(150).duration(500)}>
        <T variant="title" center>
          You’re all set.
        </T>
        <T variant="callout" tone="secondary" center style={{ marginTop: Space.s }}>
          {name ? `Tender is following ${name}’s cycle.` : 'Tender is following her cycle.'}
        </T>
      </Animated.View>

      <View style={styles.rows}>
        {rows.map((r, i) => (
          <Animated.View key={r.title} entering={FadeInDown.delay(300 + i * 140).duration(500)} style={styles.row}>
            <View style={[styles.icon, { backgroundColor: alpha(pal.glow, dark ? 0.2 : 0.22) }]}>
              <Icon name={r.icon} size={19} color={ink(pal.glow, dark)} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T variant="headline">{r.title}</T>
              <T variant="callout" style={{ color: colors.textSecondary }}>
                {r.body}
              </T>
            </View>
          </Animated.View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', justifyContent: 'center', height: 150, marginTop: Space.l, marginBottom: Space.l },
  rows: { gap: Space.xl, marginTop: Space.xxl },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.l },
  icon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
});
