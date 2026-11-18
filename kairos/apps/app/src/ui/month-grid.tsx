import { addDays, diffDays, weekday, type ISODate } from '@kairos/core';
import { StyleSheet, View } from 'react-native';

import { Press } from './controls';
import { T } from './text';
import { alpha, useTheme } from './theme';

const monthFirst = (d: ISODate): ISODate => `${d.slice(0, 8)}01`;
const nextMonth = (d: ISODate): ISODate => monthFirst(addDays(monthFirst(d), 32));

export const monthName = (d: ISODate, withYear = false) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'long', ...(withYear ? { year: 'numeric' } : {}) });

/**
 * One month as a grid of days. Marked days are filled; tapping a day toggles
 * it. Used to confirm what was read from a screenshot and to pick a date.
 */
export function MonthGrid({
  month,
  weekStart = 0,
  today,
  marked,
  soft,
  onPress,
  accent,
}: {
  /** Any day in the month. */
  month: ISODate;
  weekStart?: number;
  today: ISODate;
  marked: ReadonlySet<ISODate>;
  /** Shown as a faint ring: days the other app predicts. */
  soft?: ReadonlySet<ISODate>;
  onPress?: (date: ISODate) => void;
  accent: string;
}) {
  const { colors } = useTheme();
  const first = monthFirst(month);
  const length = diffDays(first, nextMonth(first));
  const lead = (weekday(first) - weekStart + 7) % 7;
  const cells: (ISODate | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length }, (_, i) => addDays(first, i)),
  ];
  while (cells.length % 7) cells.push(null);

  return (
    <View style={{ gap: 6 }}>
      <T variant="headline" style={{ paddingLeft: 6 }}>
        {monthName(first)}
      </T>
      <View style={styles.grid}>
        {cells.map((date, i) => {
          if (!date) return <View key={`b${i}`} style={styles.cell} />;
          const on = marked.has(date);
          const future = date > today;
          const body = (
            <View
              style={[
                styles.day,
                on
                  ? { backgroundColor: accent }
                  : soft?.has(date)
                    ? { borderWidth: 1.5, borderColor: alpha(accent, 0.55), borderStyle: 'dashed' }
                    : date === today
                      ? { backgroundColor: alpha(colors.text, 0.1) }
                      : null,
              ]}>
              {/* The day circle is a fixed 38pt, so its number can't grow with the text size: capped at 1.4x
                  (about 21pt). Without the cap the digits are cut off at the largest setting and a date can't be
                  picked. VoiceOver still reads the full label on the button. */}
              <T
                variant="callout"
                maxFontSizeMultiplier={1.4}
                color={on ? '#FFFFFF' : future ? colors.textTertiary : colors.text}
                style={{ fontWeight: on || date === today ? '700' : '400', fontVariant: ['tabular-nums'] }}>
                {Number(date.slice(8))}
              </T>
            </View>
          );
          return (
            <View key={date} style={styles.cell}>
              {onPress && !future ? (
                <Press
                  onPress={() => onPress(date)}
                  accessibilityLabel={`${monthName(date)} ${Number(date.slice(8))}${on ? ', period day' : ''}`}>
                  {body}
                </Press>
              ) : (
                body
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
