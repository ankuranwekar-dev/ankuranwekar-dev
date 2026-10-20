import { LOVE_DIMENSIONS, type LoveDimension } from '@kairos/core';
import { StyleSheet, View } from 'react-native';

import { useKairos } from '@/state/kairos';
import { useStore } from '@/state/store';
import { Press, SectionLabel } from '@/ui/controls';
import { Glass } from '@/ui/glass';
import { Icon, type IconName } from '@/ui/icon';
import { Screen } from '@/ui/screen';
import { T } from '@/ui/text';
import { alpha, Radius, seasonColors, Space, useTheme, ink } from '@/ui/theme';

const FAVORITES: {
  key: 'flowers' | 'treat' | 'scent' | 'drink' | 'comfortFood' | 'cuisine' | 'place' | 'music';
  label: string;
  icon: IconName;
}[] = [
  { key: 'flowers', label: 'Flowers', icon: 'sparkles' },
  { key: 'treat', label: 'Treat', icon: 'bag' },
  { key: 'scent', label: 'Scent', icon: 'drop' },
  { key: 'drink', label: 'Coffee order', icon: 'timer' },
  { key: 'comfortFood', label: 'Comfort food', icon: 'table' },
  { key: 'cuisine', label: 'Date-night food', icon: 'table' },
  { key: 'place', label: 'Favorite place', icon: 'heart' },
  { key: 'music', label: 'Music', icon: 'sparkles' },
];

const LOVE_LABEL: Record<LoveDimension, string> = {
  presence: 'Your full attention',
  words: 'Hearing it said',
  service: 'Help without asking',
  gifts: 'Little surprises',
  touch: 'Closeness',
  adventure: 'Doing new things',
};

const NEVER_LABEL: Record<string, string> = {
  public: 'Big public gestures',
  surprise: 'Surprises',
  'flowers-cut': 'Cut flowers',
  alcohol: 'Drinks as a plan',
  bath: 'Baths',
};

export default function HerPlaybook() {
  const k = useKairos();
  const { colors, dark } = useTheme();
  const mentions = useStore((s) => s.mentions);
  const resolve = useStore((s) => s.resolveMention);
  const pb = k.snapshot?.playbook;
  const pal = seasonColors(k.season);
  if (!pb) {
    return (
      <Screen>
        <T variant="title">Her playbook</T>
        <T variant="callout" tone="secondary" style={{ marginTop: Space.s }}>
          Appears once she shares it.
        </T>
      </Screen>
    );
  }
  const name = pb.name || 'Her';
  const loves = LOVE_DIMENSIONS.map((d) => ({ d, v: pb.loves?.[d] ?? 0.5 })).sort((a, b) => b.v - a.v);
  const open = mentions.filter((m) => !m.resolved);

  return (
    <Screen season={k.season}>
      <T variant="title">{name}’s playbook</T>
      <T variant="callout" tone="secondary" style={{ marginTop: Space.xs }}>
        Written by her, for you. Every idea you get draws from it.
      </T>

      <SectionLabel>What fills her cup</SectionLabel>
      <Glass radius={Radius.l} style={{ padding: Space.xl, gap: Space.m }}>
        {loves.map(({ d, v }) => (
          <View key={d} style={{ gap: 6 }}>
            <View style={styles.loveRow}>
              <T variant="callout">{LOVE_LABEL[d]}</T>
              <T variant="footnote" tone="tertiary">
                {v >= 0.8 ? 'Most' : v >= 0.6 ? 'A lot' : v >= 0.4 ? 'Some' : 'A little'}
              </T>
            </View>
            <View style={[styles.track, { backgroundColor: alpha(colors.text, 0.07) }]}>
              <View style={[styles.fill, { width: `${Math.round(v * 100)}%`, backgroundColor: pal.glow }]} />
            </View>
          </View>
        ))}
      </Glass>

      <SectionLabel>Her favorites</SectionLabel>
      <View style={styles.grid}>
        {FAVORITES.filter((f) => pb[f.key]).map((f) => (
          <Glass key={f.key} radius={Radius.l} style={styles.tile}>
            <Icon name={f.icon} size={16} color={ink(pal.glow, dark)} />
            <T variant="caption" tone="tertiary" style={{ marginTop: Space.s }}>
              {f.label}
            </T>
            <T variant="callout" style={{ fontWeight: '500', marginTop: 2 }}>
              {pb[f.key]}
            </T>
          </Glass>
        ))}
      </View>

      {pb.never?.length || pb.notes?.length ? (
        <>
          <SectionLabel>Good to know</SectionLabel>
          <Glass radius={Radius.l} style={{ padding: Space.xl, gap: Space.m }}>
            {(pb.never ?? []).map((n) => (
              <View key={n} style={styles.noteRow}>
                <Icon name="close" size={13} color={colors.danger} />
                <T variant="callout">Not for her: {(NEVER_LABEL[n] ?? n).toLowerCase()}</T>
              </View>
            ))}
            {(pb.notes ?? []).map((n) => (
              <View key={n} style={styles.noteRow}>
                <Icon name="quote" size={13} color={colors.textTertiary} />
                <T variant="callout">{n}</T>
              </View>
            ))}
          </Glass>
        </>
      ) : null}

      <SectionLabel>Things she mentioned</SectionLabel>
      <Glass radius={Radius.l} style={{ paddingVertical: Space.s }}>
        {open.length === 0 ? (
          <T variant="callout" tone="secondary" style={{ padding: Space.l }}>
            Nothing saved. When she mentions something in passing, add it on Today.
          </T>
        ) : (
          open.map((m) => (
            <View key={m.id} style={styles.mention}>
              <View style={{ flex: 1 }}>
                <T variant="callout">{m.text}</T>
                <T variant="footnote" tone="tertiary">
                  Saved{' '}
                  {new Date(`${m.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </T>
              </View>
              <Press
                onPress={() => resolve(m.id)}
                accessibilityLabel="Mark followed up"
                style={[styles.followed, { borderColor: colors.border }]}>
                <Icon name="check" size={14} color={colors.textSecondary} />
              </Press>
            </View>
          ))
        )}
      </Glass>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loveRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.m },
  tile: { padding: Space.l, flexBasis: '47%', flexGrow: 1 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: Space.m },
  mention: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.m,
    paddingHorizontal: Space.l,
    paddingVertical: Space.m,
  },
  followed: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
