import type { ISODate, SharedDay } from '@kairos/core';
import { StyleSheet, View } from 'react-native';

import { T } from './text';
import { alpha, phaseSeason, seasonColors, useTheme } from './theme';

/**
 * The next three weeks as a ribbon of colour: each day takes its season's
 * hue, today stands tall, and her best days carry a dot. Something to glance
 * at rather than read.
 */
export function DayStrip({ days, today, count = 21 }: { days: SharedDay[]; today: ISODate; count?: number }) {
  const { colors } = useTheme();
  const from = days.findIndex((d) => d.date === today);
  const span = from < 0 ? [] : days.slice(from, from + count);
  if (span.length === 0) return null;
  return (
    <View
      accessible
      accessibilityLabel="The next three weeks, coloured by season"
      style={{ gap: 5, alignSelf: 'stretch' }}>
      <View style={styles.row}>
        {span.map((d, i) => {
          const season = phaseSeason(d.phase);
          const colour = season ? seasonColors(season).glow : alpha(colors.text, 0.14);
          return (
            <View key={d.date} style={styles.cell}>
              <View style={[styles.dot, { backgroundColor: d.peak ? colors.text : 'transparent' }]} />
              <View
                style={[
                  styles.bar,
                  { backgroundColor: colour, height: i === 0 ? 28 : 16, opacity: i === 0 ? 1 : 0.85 },
                ]}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.ticks}>
        {span.map((d, i) =>
          i % 7 === 0 ? (
            <T
              key={d.date}
              variant="footnote"
              tone="tertiary"
              numberOfLines={1}
              style={[styles.tick, { left: `${(i / span.length) * 100}%` }]}>
              {i === 0 ? 'Today' : Number(d.date.slice(8))}
            </T>
          ) : null,
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  cell: { flex: 1, alignItems: 'center', gap: 4 },
  dot: { width: 4, height: 4, borderRadius: 2 },
  bar: { alignSelf: 'stretch', borderRadius: 5 },
  ticks: { height: 14 },
  tick: { position: 'absolute', top: 0, fontSize: 11, lineHeight: 13 },
});
