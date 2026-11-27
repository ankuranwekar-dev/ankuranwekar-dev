import { addDays, localToday, type ISODate } from '@kairos/core';
import { StyleSheet, View } from 'react-native';

import { useStore, type Logged } from '@/state/store';
import { KIND_LABEL } from '@/ui/nudge-card';
import { Glass } from '@/ui/glass';
import { Sheet } from '@/ui/sheet';
import { T } from '@/ui/text';
import { alpha, Radius, Space, useTheme } from '@/ui/theme';

const OUTCOME: Record<Logged['outcome'], string> = {
  done: 'Done',
  hearted: 'She noticed',
  skipped: 'Another idea',
  snoozed: 'Not today',
};

const day = (d: ISODate) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

/**
 * What he has done, kept on this phone (and in the private backup if he has one). Counts and a list: nothing is scored,
 * nothing is compared, nothing leaves the phone to make this screen.
 */
export default function History() {
  const history = useStore((s) => s.history);
  const { colors } = useTheme();
  const today = localToday();
  const done = history.filter((h) => h.outcome === 'done' || h.outcome === 'hearted');
  const since = (days: number) => done.filter((h) => h.date > addDays(today, -days)).length;

  const byKind = new Map<string, number>();
  for (const h of done) byKind.set(h.kind, (byKind.get(h.kind) ?? 0) + 1);
  const kinds = [...byKind].sort((a, b) => b[1] - a[1]);
  const most = kinds[0]?.[1] ?? 1;

  const rows = [...history].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));

  return (
    <Sheet title="History">
      {history.length === 0 ? (
        <T variant="callout" tone="secondary" style={{ marginTop: Space.m }}>
          Nothing yet. The ideas you do show up here.
        </T>
      ) : (
        <>
          <View style={styles.stats}>
            <Stat n={done.length} label="ideas done" />
            <Stat n={since(7)} label="this week" />
            <Stat n={since(30)} label="this month" />
          </View>

          {kinds.length ? (
            <View style={{ marginTop: Space.xxl, gap: Space.s }}>
              <T variant="caption" tone="tertiary">
                What you have done
              </T>
              {kinds.map(([kind, n]) => (
                <View key={kind} style={styles.kind}>
                  <T variant="callout" style={{ width: 130 }} numberOfLines={1}>
                    {KIND_LABEL[kind as keyof typeof KIND_LABEL] ?? kind}
                  </T>
                  <View style={[styles.track, { backgroundColor: alpha(colors.text, 0.07) }]}>
                    <View
                      style={[
                        styles.fill,
                        { width: `${Math.max(8, (n / most) * 100)}%`, backgroundColor: alpha(colors.text, 0.55) },
                      ]}
                    />
                  </View>
                  <T variant="footnote" tone="secondary" style={{ width: 24, textAlign: 'right' }}>
                    {n}
                  </T>
                </View>
              ))}
            </View>
          ) : null}

          <View style={{ marginTop: Space.xxl, gap: Space.s }}>
            <T variant="caption" tone="tertiary">
              Every idea
            </T>
            {rows.map((h) => (
              <Glass key={`${h.key}-${h.outcome}`} radius={Radius.m} style={styles.row}>
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="callout" numberOfLines={2}>
                    {h.title}
                  </T>
                  <T variant="footnote" tone="tertiary">
                    {day(h.date)}
                  </T>
                </View>
                <T variant="footnote" tone={h.outcome === 'done' || h.outcome === 'hearted' ? 'secondary' : 'tertiary'}>
                  {OUTCOME[h.outcome]}
                </T>
              </Glass>
            ))}
          </View>
        </>
      )}
    </Sheet>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <T variant="title" style={{ fontSize: 34, lineHeight: 38 }}>
        {n}
      </T>
      <T variant="footnote" tone="secondary">
        {label}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', marginTop: Space.m },
  kind: { flexDirection: 'row', alignItems: 'center', gap: Space.m },
  track: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.m, padding: Space.l },
});
