import { weekdayName } from '@kairos/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { calendarAvailable, syncSeasonsToCalendar } from '@/platform/calendar';
import { haptic } from '@/platform/haptics';
import { useKairos } from '@/state/kairos';
import { useStore } from '@/state/store';
import { Button, Press } from '@/ui/controls';
import { Icon } from '@/ui/icon';
import { KIND_ICON } from '@/ui/nudge-card';
import { CycleRing, SeasonWeeks } from '@/ui/ring';
import { Sheet } from '@/ui/sheet';
import { T } from '@/ui/text';
import { ink, seasonColors, Space, useTheme } from '@/ui/theme';

/** One level down from Today: where she is in her cycle, the weeks ahead, and what is planned. */
export default function Rhythm() {
  const k = useKairos();
  const s = useStore();
  const { colors, dark } = useTheme();
  const pal = seasonColors(k.season);
  const him = s.role !== 'her';
  const [synced, setSynced] = useState(s.calendar.synced);
  const snap = k.snapshot;

  if (!snap || snap.status !== 'ok') {
    return (
      <Sheet title="Rhythm">
        <T variant="callout" tone="secondary">
          Nothing to show yet.
        </T>
      </Sheet>
    );
  }

  const sync = async () => {
    try {
      const n = await syncSeasonsToCalendar(snap.days);
      if (n > 0) {
        s.setCalendar({ synced: true, lastSync: new Date().toISOString() });
        setSynced(true);
        haptic.success();
      }
    } catch {
      /* permission declined: leave the button as it was */
    }
  };

  return (
    <Sheet title="Rhythm">
      {snap.cycle ? (
        <View style={styles.ring}>
          <CycleRing
            days={snap.days}
            start={snap.cycle.start}
            length={snap.cycle.length}
            today={k.today}
            size={232}
            centerTop={k.cycleDay ? `Day ${k.cycleDay}` : ''}
            {...(k.copy ? { centerBottom: k.copy.name } : {})}
          />
        </View>
      ) : null}

      <SeasonWeeks days={snap.days} today={k.today} weeks={5} />

      {him && k.copy ? (
        <View style={styles.block}>
          <T variant="caption" color={ink(pal.glow, dark)}>
            Lands well now
          </T>
          {k.copy.helps.slice(0, 3).map((h) => (
            <View key={h} style={styles.bullet}>
              <View style={[styles.dot, { backgroundColor: pal.glow }]} />
              <T variant="callout" style={{ flex: 1 }}>
                {h}
              </T>
            </View>
          ))}
        </View>
      ) : null}

      {him && k.upcoming.length ? (
        <View style={styles.block}>
          <T variant="caption" tone="tertiary">
            Coming up
          </T>
          {k.upcoming.slice(0, 3).map((n) => (
            <Press
              key={n.key}
              haptics={false}
              onPress={() => router.push({ pathname: '/nudge', params: { key: n.key } })}
              style={styles.up}
              accessibilityLabel={`${weekdayName(n.date)}: ${n.title}`}>
              <T variant="footnote" tone="tertiary" style={styles.upDay}>
                {weekdayName(n.date).slice(0, 3)} {Number(n.date.slice(8))}
              </T>
              <T variant="callout" numberOfLines={1} style={{ flex: 1 }}>
                {n.title}
              </T>
              <Icon name={KIND_ICON[n.kind]} size={14} color={colors.textTertiary} />
            </Press>
          ))}
        </View>
      ) : null}

      {him ? (
        <Button
          label={
            synced
              ? 'Seasons are in your calendar'
              : calendarAvailable()
                ? 'Add seasons to my calendar'
                : 'Calendar file opens outside this preview'
          }
          icon={synced ? 'check' : 'calendar'}
          kind="secondary"
          disabled={!calendarAvailable()}
          style={{ marginTop: Space.xxl }}
          onPress={sync}
        />
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  ring: { alignItems: 'center', marginBottom: Space.xl },
  block: { marginTop: Space.xxl, gap: Space.s },
  bullet: { flexDirection: 'row', alignItems: 'center', gap: Space.m },
  dot: { width: 6, height: 6, borderRadius: 3 },
  up: { flexDirection: 'row', alignItems: 'center', gap: Space.m, minHeight: 40 },
  upDay: { width: 58, fontWeight: '600' },
});
