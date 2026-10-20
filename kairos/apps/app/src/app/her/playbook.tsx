import { LOVE_DIMENSIONS, type LoveDimension, type Playbook } from '@kairos/core';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { useKairos } from '@/state/kairos';
import { useStore } from '@/state/store';
import { Chip, Press, SectionLabel } from '@/ui/controls';
import { Glass } from '@/ui/glass';
import { Icon } from '@/ui/icon';
import { Screen } from '@/ui/screen';
import { T } from '@/ui/text';
import { alpha, Radius, seasonColors, Space, useTheme } from '@/ui/theme';

type FavKey = 'flowers' | 'treat' | 'scent' | 'drink' | 'comfortFood' | 'cuisine' | 'place' | 'music';

const FIELDS: { key: FavKey; label: string; placeholder: string }[] = [
  { key: 'flowers', label: 'Flowers', placeholder: 'Peonies, ranunculus…' },
  { key: 'treat', label: 'Treat', placeholder: 'Salted dark chocolate' },
  { key: 'drink', label: 'Coffee order', placeholder: 'Oat flat white' },
  { key: 'comfortFood', label: 'Comfort food', placeholder: 'Pho, mac and cheese…' },
  { key: 'cuisine', label: 'Date-night food', placeholder: 'Japanese' },
  { key: 'scent', label: 'Perfume', placeholder: 'The one you always wear' },
  { key: 'place', label: 'Favorite place', placeholder: 'The beach at sunset' },
  { key: 'music', label: 'Music', placeholder: 'Norah Jones' },
];

const LOVES: Record<LoveDimension, { title: string; body: string }> = {
  presence: { title: 'Full attention', body: 'Phones down, really listening' },
  words: { title: 'Hearing it said', body: 'Compliments, notes, reassurance' },
  service: { title: 'Help without asking', body: 'Chores and logistics, handled' },
  gifts: { title: 'Little surprises', body: '“Saw this and thought of you”' },
  touch: { title: 'Closeness', body: 'Hugs, hands, falling asleep close' },
  adventure: { title: 'Doing new things', body: 'Plans, places, firsts' },
};

const NEVER: { tag: string; label: string }[] = [
  { tag: 'public', label: 'Big public gestures' },
  { tag: 'surprise', label: 'Surprise plans' },
  { tag: 'flowers-cut', label: 'Cut flowers' },
  { tag: 'bath', label: 'Baths' },
];

export default function PlaybookEditor() {
  const k = useKairos();
  const { colors } = useTheme();
  const pb = useStore((s) => s.playbook);
  const update = useStore((s) => s.updatePlaybook);
  const his = useStore((s) => s.hisName) || 'he';
  const pal = seasonColors(k.season);
  const [note, setNote] = useState('');

  const setLove = (d: LoveDimension, v: number) => update({ loves: { ...pb.loves, [d]: v } });
  const toggleNever = (tag: string) => {
    const set = new Set(pb.never ?? []);
    if (set.has(tag)) set.delete(tag);
    else set.add(tag);
    update({ never: [...set] });
  };

  return (
    <Screen season={k.season}>
      <T variant="title">Your playbook</T>
      <T variant="callout" tone="secondary" style={{ marginTop: Space.xs }}>
        What you love, in your words. {his === 'he' ? 'He' : his} never sees this screen, only the ideas it shapes.
      </T>

      <SectionLabel>Your name</SectionLabel>
      <Field value={pb.name} placeholder="What he calls you" onChange={(name) => update({ name } as Partial<Playbook>)} />

      <SectionLabel>What makes you feel loved</SectionLabel>
      <Glass radius={Radius.l} style={{ paddingVertical: Space.s }}>
        {LOVE_DIMENSIONS.map((d, i) => {
          const v = pb.loves?.[d] ?? 0.5;
          return (
            <View key={d} style={[styles.loveRow, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline } : null]}>
              <View style={{ flex: 1 }}>
                <T variant="callout" style={{ fontWeight: '500' }}>
                  {LOVES[d].title}
                </T>
                <T variant="footnote" tone="tertiary">
                  {LOVES[d].body}
                </T>
              </View>
              <View style={styles.dots}>
                {[0.2, 0.45, 0.7, 0.95].map((level) => (
                  <Press key={level} onPress={() => setLove(d, level)} accessibilityLabel={`${LOVES[d].title}: ${level}`} style={styles.dotHit}>
                    <View
                      style={[
                        styles.dot,
                        { backgroundColor: v >= level - 0.01 ? pal.glow : alpha(colors.text, 0.12), transform: [{ scale: 0.7 + level * 0.4 }] },
                      ]}
                    />
                  </Press>
                ))}
              </View>
            </View>
          );
        })}
      </Glass>

      <SectionLabel>Your favorites</SectionLabel>
      <Glass radius={Radius.l} style={{ paddingVertical: Space.xs }}>
        {FIELDS.map((f, i) => (
          <View key={f.key} style={[styles.fieldRow, i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline } : null]}>
            <T variant="footnote" tone="secondary" style={{ width: 118 }}>
              {f.label}
            </T>
            <TextInput
              value={pb[f.key] ?? ''}
              onChangeText={(t) => update({ [f.key]: t } as Partial<Playbook>)}
              placeholder={f.placeholder}
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { color: colors.text }]}
            />
          </View>
        ))}
      </Glass>

      <SectionLabel>Please don’t</SectionLabel>
      <View style={styles.chips}>
        {NEVER.map((n) => (
          <Chip key={n.tag} label={n.label} selected={(pb.never ?? []).includes(n.tag)} accent={colors.danger} onPress={() => toggleNever(n.tag)} />
        ))}
      </View>

      <SectionLabel>Notes for him</SectionLabel>
      <Glass radius={Radius.l} style={{ padding: Space.l, gap: Space.m }}>
        {(pb.notes ?? []).map((n) => (
          <View key={n} style={styles.noteRow}>
            <T variant="callout" style={{ flex: 1 }}>
              {n}
            </T>
            <Press onPress={() => update({ notes: (pb.notes ?? []).filter((x) => x !== n) })} accessibilityLabel="Remove note">
              <Icon name="close" size={14} color={colors.textTertiary} />
            </Press>
          </View>
        ))}
        <TextInput
          value={note}
          onChangeText={setNote}
          onSubmitEditing={() => {
            if (note.trim()) update({ notes: [...(pb.notes ?? []), note.trim()] });
            setNote('');
          }}
          placeholder="Allergic to lilies, hates being rushed in the morning…"
          placeholderTextColor={colors.textTertiary}
          returnKeyType="done"
          style={[styles.noteInput, { color: colors.text, backgroundColor: alpha(colors.text, 0.05) }]}
        />
      </Glass>
    </Screen>
  );
}

function Field({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (t: string) => void }) {
  const { colors } = useTheme();
  return (
    <Glass radius={Radius.l} style={{ paddingHorizontal: Space.l }}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        style={[styles.input, { color: colors.text, height: 50 }]}
      />
    </Glass>
  );
}

const styles = StyleSheet.create({
  loveRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.l, paddingVertical: Space.m, gap: Space.m },
  dots: { flexDirection: 'row', alignItems: 'center' },
  dotHit: { width: 30, height: 34, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.l, minHeight: 48 },
  input: { flex: 1, fontSize: 16, height: 46 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.s },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: Space.m },
  noteInput: { fontSize: 15, height: 44, borderRadius: Radius.m, paddingHorizontal: Space.m },
});
