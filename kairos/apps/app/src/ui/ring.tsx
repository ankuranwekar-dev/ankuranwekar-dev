import { addDays, diffDays, type ISODate, type SharedDay } from '@kairos/core';
import { View } from 'react-native';
import Svg, { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';

import { T } from './text';
import { alpha, phaseSeason, seasonColors, useTheme } from './theme';

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const s = polar(cx, cy, r, a0);
  const e = polar(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

/**
 * Her cycle as a ring. One segment per day, colored by season. Future days
 * fade with uncertainty; the fertile band (when shared) glows on the outside
 * with an intensity equal to its probability, so the edges are honestly soft.
 */
export function CycleRing({
  days,
  start,
  length,
  today,
  size = 300,
  centerTop,
  centerBottom,
}: {
  days: SharedDay[];
  start: ISODate;
  length: number;
  today: ISODate;
  size?: number;
  centerTop: string;
  centerBottom?: string;
}) {
  const { colors, dark } = useTheme();
  const n = Math.max(21, Math.min(45, Math.max(length, diffDays(start, today) + 3)));
  const byDate = new Map(days.map((d) => [d.date, d]));
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 26;
  const outer = r + 15;
  const step = 360 / n;
  const gap = Math.min(2.4, step * 0.22);
  const todayIdx = diffDays(start, today);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Defs>
          <RadialGradient id="ring-today" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.9} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={cx} cy={cy} r={r} stroke={colors.hairline} strokeWidth={14} fill="none" />
        {Array.from({ length: n }, (_, i) => {
          const date = addDays(start, i);
          const d = byDate.get(date);
          const season = phaseSeason(d?.phase);
          const pal = seasonColors(season);
          const past = i < todayIdx;
          const isToday = i === todayIdx;
          const opacity = isToday ? 1 : past ? 0.38 : d?.phase ? 0.92 - Math.min(0.5, (i - todayIdx) * 0.012) : 0.18;
          const color = season ? pal.from : colors.textTertiary;
          const a0 = i * step + gap / 2;
          const a1 = (i + 1) * step - gap / 2;
          return (
            <G key={date}>
              <Path
                d={arc(cx, cy, r, a0, a1)}
                stroke={color}
                strokeOpacity={opacity}
                strokeWidth={isToday ? 20 : 14}
                fill="none"
                strokeLinecap="round"
              />
              {d?.fertile !== undefined && d.fertile > 0.04 ? (
                <Path
                  d={arc(cx, cy, outer, a0 - gap / 2, a1 + gap / 2)}
                  stroke={seasonColors('summer').glow}
                  strokeOpacity={Math.min(1, d.fertile) * (past ? 0.35 : 0.95)}
                  strokeWidth={4}
                  fill="none"
                />
              ) : null}
              {d?.peak ? (
                <Circle
                  cx={polar(cx, cy, outer + 9, (i + 0.5) * step).x}
                  cy={polar(cx, cy, outer + 9, (i + 0.5) * step).y}
                  r={2.6}
                  fill={seasonColors('summer').from}
                  opacity={past ? 0.4 : 1}
                />
              ) : null}
              {(d?.bleeding ?? 0) > 0.25 && !past ? (
                <Circle
                  cx={polar(cx, cy, r - 17, (i + 0.5) * step).x}
                  cy={polar(cx, cy, r - 17, (i + 0.5) * step).y}
                  r={1.5 + 1.5 * (d?.bleeding ?? 0)}
                  fill={seasonColors('winter').glow}
                  opacity={0.35 + 0.6 * (d?.bleeding ?? 0)}
                />
              ) : null}
            </G>
          );
        })}
        {todayIdx >= 0 && todayIdx < n ? (
          <G>
            <Circle
              cx={polar(cx, cy, r, (todayIdx + 0.5) * step).x}
              cy={polar(cx, cy, r, (todayIdx + 0.5) * step).y}
              r={16}
              fill="url(#ring-today)"
              opacity={dark ? 0.35 : 0.6}
            />
            <Circle
              cx={polar(cx, cy, r, (todayIdx + 0.5) * step).x}
              cy={polar(cx, cy, r, (todayIdx + 0.5) * step).y}
              r={4.5}
              fill={dark ? '#FFFFFF' : '#1E1519'}
            />
          </G>
        ) : null}
      </Svg>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <T variant="display" center>
          {centerTop}
        </T>
        {centerBottom ? (
          <T variant="footnote" tone="secondary" center style={{ maxWidth: size * 0.5 }}>
            {centerBottom}
          </T>
        ) : null}
      </View>
    </View>
  );
}

/** Eight weeks at a glance: one rounded cell per day, colored by season, faded by uncertainty. */
export function SeasonWeeks({
  days,
  today,
  weeks = 8,
  onSelect,
  selected,
}: {
  days: SharedDay[];
  today: ISODate;
  weeks?: number;
  onSelect?: (d: ISODate) => void;
  selected?: ISODate;
}) {
  const { colors } = useTheme();
  const byDate = new Map(days.map((d) => [d.date, d]));
  // Start on the Monday of this week.
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const first = addDays(today, -dow);
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return (
    <View style={{ gap: 7 }}>
      <View style={{ flexDirection: 'row', gap: 7 }}>
        {labels.map((l, i) => (
          <T key={i} variant="caption" tone="tertiary" center style={{ flex: 1, letterSpacing: 0.4 }}>
            {l}
          </T>
        ))}
      </View>
      {Array.from({ length: weeks }, (_, w) => (
        <View key={w} style={{ flexDirection: 'row', gap: 7 }}>
          {Array.from({ length: 7 }, (_, i) => {
            const date = addDays(first, w * 7 + i);
            const d = byDate.get(date);
            const season = phaseSeason(d?.phase);
            const pal = seasonColors(season);
            const past = date < today;
            const isToday = date === today;
            // Past days dim; future days stay full color (alpha over near-black turns peach into mud).
            const fade = past ? 0.28 : 1;
            return (
              <View
                key={date}
                onTouchEnd={onSelect ? () => onSelect(date) : undefined}
                style={{
                  flex: 1,
                  aspectRatio: 1,
                  borderRadius: 9,
                  backgroundColor: season ? alpha(pal.from, fade) : alpha(colors.text, 0.06),
                  borderWidth: isToday || selected === date ? 2 : 0,
                  borderColor: isToday ? colors.text : alpha(colors.text, 0.5),
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                {d?.peak ? (
                  <View
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 3,
                      backgroundColor: '#FFFFFF',
                      opacity: past ? 0.5 : 0.95,
                    }}
                  />
                ) : null}
                {(d?.bleeding ?? 0) > 0.35 && !d?.peak ? (
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#FFFFFF', opacity: 0.55 }} />
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}
