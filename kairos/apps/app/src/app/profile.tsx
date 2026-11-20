import type { Cadence, Playbook, ShareLevel } from '@kairos/core';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Platform, StyleSheet, TextInput, View } from 'react-native';

import { haptic } from '@/platform/haptics';
import { relayConfigured, unpair } from '@/platform/relay';
import { useKairos } from '@/state/kairos';
import { useStore } from '@/state/store';
import { Button, Chip, Press, Segmented, Toggle } from '@/ui/controls';
import { Icon } from '@/ui/icon';
import { Sheet } from '@/ui/sheet';
import { T } from '@/ui/text';
import { alpha, Fonts, Radius, seasonColors, Space, useTheme } from '@/ui/theme';

type FavKey = 'flowers' | 'treat' | 'drink' | 'cuisine';
const FAVOURITES: { key: FavKey; label: string }[] = [
  { key: 'flowers', label: 'Flowers' },
  { key: 'treat', label: 'Treat' },
  { key: 'drink', label: 'Coffee' },
  { key: 'cuisine', label: 'Dinner out' },
];
const NEVER: { tag: string; label: string }[] = [
  { tag: 'public', label: 'Public gestures' },
  { tag: 'surprise', label: 'Surprises' },
  { tag: 'flowers-cut', label: 'Cut flowers' },
];
const CADENCE: { value: Cadence; label: string }[] = [
  { value: 'light', label: '3 a week' },
  { value: 'steady', label: '5 a week' },
  { value: 'devoted', label: 'Daily' },
];
const SHARE: { value: ShareLevel; label: string }[] = [
  { value: 'period', label: 'Period' },
  { value: 'seasons', label: 'Seasons' },
  { value: 'fertility', label: 'Everything' },
];
const TIMES = ['07:30', '08:30', '12:00', '17:30'];

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <T variant="caption" tone="tertiary">
        {label}
      </T>
      {children}
    </View>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.line, { borderColor: colors.hairline }]}>
      <T variant="callout" style={{ flex: 1 }}>
        {label}
      </T>
      {children}
    </View>
  );
}

function Favourites({ playbook, onChange }: { playbook: Playbook; onChange?: (patch: Partial<Playbook>) => void }) {
  const { colors } = useTheme();
  return (
    <View>
      {FAVOURITES.map((f) => (
        <View key={f.key} style={[styles.line, { borderColor: colors.hairline }]}>
          <T variant="callout" tone="secondary" style={{ width: 96 }}>
            {f.label}
          </T>
          {onChange ? (
            <TextInput
              value={playbook[f.key] ?? ''}
              onChangeText={(t) => onChange({ [f.key]: t })}
              placeholder="Add"
              placeholderTextColor={colors.textTertiary}
              returnKeyType="done"
              style={[styles.input, { color: colors.text }]}
            />
          ) : (
            <T variant="callout" style={{ flex: 1, textAlign: 'right' }}>
              {playbook[f.key] || '—'}
            </T>
          )}
        </View>
      ))}
    </View>
  );
}

/**
 * Erasing everything takes a second, deliberate tap. On the web that is a button that asks
 * "Tap again to erase" (hosts that embed the page suppress browser dialogs); on a phone it is
 * the system alert.
 */
function StartOver() {
  const reset = useStore((s) => s.reset);
  const { colors } = useTheme();
  const [armed, setArmed] = useState(false);
  const go = () => {
    reset();
    router.dismissTo('/welcome');
  };
  const press = () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Start over?', 'This erases everything Tender holds on this phone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Erase', style: 'destructive', onPress: go },
      ]);
      return;
    }
    if (armed) go();
    else {
      setArmed(true);
      setTimeout(() => setArmed(false), 4000);
    }
  };
  return (
    <Press onPress={press} accessibilityLabel={armed ? 'Tap again to erase everything' : 'Start over'}>
      <T variant="label" color={colors.danger}>
        {armed ? 'Tap again to erase everything' : 'Start over'}
      </T>
    </Press>
  );
}

/** Everything that is not Today, in one sheet: who she is, what is shared, how ideas arrive. */
export default function Profile() {
  const role = useStore((s) => s.role);
  return role === 'her' ? <HerProfile /> : <HimProfile />;
}

function HimProfile() {
  const s = useStore();
  const k = useKairos();
  const { colors } = useTheme();
  const pal = seasonColors(k.season);
  const paired = s.pairing.status === 'paired';
  const playbook = k.snapshot?.playbook ?? s.playbook;
  const [mention, setMention] = useState('');
  const open = s.mentions.filter((m) => !m.resolved);
  const last = [...s.cycle.periods].sort((a, b) => (a.start < b.start ? -1 : 1)).pop();

  return (
    <Sheet>
      {paired ? (
        <T variant="title">{playbook.name || 'Her'}</T>
      ) : (
        <TextInput
          value={s.playbook.name}
          onChangeText={(t) => s.updatePlaybook({ name: t })}
          placeholder="Her name"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="words"
          autoCorrect={false}
          style={[styles.name, { color: colors.text }]}
        />
      )}
      <T variant="footnote" tone="tertiary" style={{ marginTop: 2 }}>
        {paired
          ? `Paired, end-to-end encrypted  ${s.pairing.safety?.join(' ') ?? ''}`
          : last
            ? `Last period ${new Date(`${last.start}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
            : 'No cycle yet'}
      </T>

      {!paired ? (
        <Section label="Her cycle">
          <View style={styles.wrap}>
            <Chip
              label="New photo"
              icon="camera"
              onPress={() => router.push({ pathname: '/import', params: { mode: 'screenshot', next: 'back' } })}
            />
            <Chip
              label="Period started"
              icon="drop"
              onPress={() => router.push({ pathname: '/import', params: { mode: 'date', next: 'back' } })}
            />
            {relayConfigured ? <Chip label="Scan her code" icon="scan" onPress={() => router.push('/scan')} /> : null}
          </View>
          <Line label="We’re trying for a baby">
            <Toggle
              value={s.intent === 'trying'}
              onChange={(on) => s.setIntent(on ? 'trying' : 'closer')}
              label="We’re trying for a baby"
              accent={pal.glow}
            />
          </Line>
        </Section>
      ) : null}

      <Section label="Ideas">
        <Segmented
          value={s.prefs.cadence}
          onChange={(cadence) => s.updatePrefs({ cadence })}
          options={CADENCE}
          accent={pal.glow}
        />
        <View style={styles.wrap}>
          {TIMES.map((t) => (
            <Chip
              key={t}
              label={t}
              selected={s.prefs.notifyAt === t}
              accent={pal.glow}
              onPress={() => s.updatePrefs({ notifyAt: t })}
            />
          ))}
        </View>
      </Section>

      <Section label="She loves">
        <Favourites playbook={playbook} {...(paired ? {} : { onChange: s.updatePlaybook })} />
      </Section>

      <Section label="She mentioned">
        <View style={[styles.capture, { backgroundColor: alpha(colors.text, 0.06) }]}>
          <TextInput
            value={mention}
            onChangeText={setMention}
            onSubmitEditing={() => {
              if (!mention.trim()) return;
              s.addMention(mention, k.today);
              haptic.success();
              setMention('');
            }}
            placeholder="Something to remember"
            placeholderTextColor={colors.textTertiary}
            returnKeyType="done"
            style={[styles.mention, { color: colors.text }]}
          />
        </View>
        {open.map((m) => (
          <View key={m.id} style={[styles.line, { borderColor: colors.hairline }]}>
            <T variant="callout" style={{ flex: 1 }}>
              {m.text}
            </T>
            <Press onPress={() => s.resolveMention(m.id)} accessibilityLabel={`Done with ${m.text}`}>
              <Icon name="check" size={16} color={colors.textTertiary} />
            </Press>
          </View>
        ))}
      </Section>

      <View style={styles.reset}>
        <StartOver />
      </View>
    </Sheet>
  );
}

function HerProfile() {
  const s = useStore();
  const k = useKairos();
  const { colors } = useTheme();
  const pal = seasonColors(k.season);
  const paired = s.pairing.status === 'paired';
  const never = s.playbook.never ?? [];
  const [test, setTest] = useState<'positive' | 'negative'>();

  return (
    <Sheet>
      <TextInput
        value={s.playbook.name}
        onChangeText={(t) => s.updatePlaybook({ name: t })}
        placeholder="Your name"
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="words"
        autoCorrect={false}
        style={[styles.name, { color: colors.text }]}
      />
      <T variant="footnote" tone="tertiary" style={{ marginTop: 2 }}>
        {paired ? `Paired, end-to-end encrypted  ${s.pairing.safety?.join(' ') ?? ''}` : 'Not paired'}
      </T>

      <Section label="He sees">
        <Segmented value={s.share} onChange={s.setShare} options={SHARE} accent={pal.glow} />
        <Line label="Pause sharing">
          <Toggle value={s.paused} onChange={s.setPaused} label="Pause sharing" accent={pal.glow} />
        </Line>
        <Line label="We’re trying for a baby">
          <Toggle
            value={s.intent === 'trying'}
            onChange={(on) => s.setIntent(on ? 'trying' : 'closer')}
            label="We’re trying for a baby"
            accent={pal.glow}
          />
        </Line>
        {!paired && relayConfigured ? (
          <Button label="Invite him" icon="qr" accent={pal.glow} onPress={() => router.push('/invite')} />
        ) : null}
      </Section>

      <Section label="You love">
        <Favourites playbook={s.playbook} onChange={s.updatePlaybook} />
        <T variant="caption" tone="tertiary" style={{ marginTop: Space.m }}>
          Please don’t
        </T>
        <View style={styles.wrap}>
          {NEVER.map((n) => (
            <Chip
              key={n.tag}
              label={n.label}
              selected={never.includes(n.tag)}
              accent={pal.glow}
              onPress={() =>
                s.updatePlaybook({
                  never: never.includes(n.tag) ? never.filter((t) => t !== n.tag) : [...never, n.tag],
                })
              }
            />
          ))}
        </View>
      </Section>

      <Section label="Your cycle">
        <View style={styles.wrap}>
          <Chip
            label="Add a photo"
            icon="camera"
            onPress={() => router.push({ pathname: '/import', params: { mode: 'screenshot', next: 'back' } })}
          />
          <Chip
            label="Fix a date"
            icon="day"
            onPress={() => router.push({ pathname: '/import', params: { mode: 'date', next: 'back' } })}
          />
        </View>
        {s.intent === 'trying' ? (
          test ? (
            <T variant="callout" tone="secondary">
              {test === 'positive'
                ? 'Congratulations. Sharing is paused; the news is yours to tell.'
                : 'Logged. Be gentle with yourself today.'}
            </T>
          ) : (
            <Line label="Pregnancy test">
              <View style={{ flexDirection: 'row', gap: Space.s }}>
                <Button
                  label="Positive"
                  compact
                  kind="secondary"
                  onPress={() => {
                    s.logPregnancyTest(k.today, true);
                    s.setPaused(true);
                    setTest('positive');
                  }}
                />
                <Button
                  label="Negative"
                  compact
                  kind="secondary"
                  onPress={() => {
                    s.logPregnancyTest(k.today, false);
                    setTest('negative');
                  }}
                />
              </View>
            </Line>
          )
        ) : null}
      </Section>

      <View style={styles.reset}>
        {paired ? (
          <Press
            onPress={async () => {
              await unpair().catch(() => {});
              s.setPairing({ status: 'none' });
            }}
            accessibilityLabel="Unpair">
            <T variant="label" tone="secondary">
              Unpair
            </T>
          </Press>
        ) : null}
        <StartOver />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  name: { fontFamily: Fonts.sans, fontSize: 30, fontWeight: '700', lineHeight: 36, height: 42, padding: 0 },
  section: { marginTop: Space.xxl, gap: Space.m },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.m,
    minHeight: 50,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontSize: 16, height: 46, textAlign: 'right' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.s },
  capture: { borderRadius: Radius.m, paddingHorizontal: Space.m, height: 48, justifyContent: 'center' },
  mention: { fontSize: 16, height: 48 },
  reset: { marginTop: Space.xxxl, alignItems: 'center', gap: Space.l },
});
