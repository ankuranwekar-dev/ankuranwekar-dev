import { weekdayName } from '@kairos/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { haptic } from '@/platform/haptics';
import { rangeLabel, useKairos } from '@/state/kairos';
import { useStore } from '@/state/store';
import { Press, SectionLabel } from '@/ui/controls';
import { Glass } from '@/ui/glass';
import { Icon } from '@/ui/icon';
import { KIND_ICON, NudgeCard } from '@/ui/nudge-card';
import { Orb } from '@/ui/orb';
import { Screen } from '@/ui/screen';
import { SignalCard } from '@/ui/signal-card';
import { T } from '@/ui/text';
import { alpha, Radius, seasonColors, Space, useTheme, ink } from '@/ui/theme';

function longDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function HimToday() {
  const k = useKairos();
  const { colors, dark } = useTheme();
  const s = useStore();
  const name = k.snapshot?.playbook.name || s.pairing.partnerName || 'Her';
  const pal = seasonColors(k.season);
  const quiet = k.activeSignal?.response.quietUntil && Date.parse(k.activeSignal.response.quietUntil) > Date.now();
  const snoozedAny = s.history.find((h) => h.date === k.today && h.outcome === 'snoozed');

  if (!k.snapshot) return <Waiting name={name} />;
  if (k.snapshot.status === 'paused') return <Paused name={name} />;

  const seasonName = k.copy?.name.toLowerCase() ?? 'season';
  const chips: string[] = [];
  if (k.summerIn !== undefined && k.snapshot.share === 'fertility') {
    chips.push(`${k.snapshot.intent === 'trying' ? 'Fertile window' : 'Summer'} ${k.summerIn === 1 ? 'tomorrow' : `in ${k.summerIn} days`}`);
  }
  if (k.phase === 'ovulatory' && k.snapshot.share === 'fertility') {
    const word = k.snapshot.intent === 'trying' ? 'Best' : 'Peak';
    const ahead = (k.snapshot.fertileWindow?.best ?? []).filter((b) => b > k.today);
    if (k.day?.peak) chips.push(`${word} day today`);
    else if (ahead.length) chips.push(`${word} days: ${ahead.map((b) => weekdayName(b).slice(0, 3)).join(' & ')}`);
  }
  if (k.periodIn && k.phase !== 'menstrual') chips.push(`Period ${rangeLabel(k.periodIn)}`);

  return (
    <Screen season={k.season}>
      <View style={styles.header}>
        <T variant="caption" tone="tertiary">
          {longDate(k.today)}
        </T>
        <Press onPress={() => router.push('/settings')} accessibilityLabel="Settings" style={styles.iconButton}>
          <Icon name="gear" size={18} color={colors.textSecondary} />
        </Press>
      </View>

      <Animated.View entering={FadeIn.duration(900)} style={styles.hero}>
        <Orb season={k.season} size={196} />
      </Animated.View>

      <View style={styles.titleBlock}>
        <T variant="display" center>
          {name}’s <T variant="display" italic color={ink(pal.glow, dark)}>{seasonName}</T>
        </T>
        <T variant="callout" tone="secondary" center style={{ maxWidth: 360 }}>
          {k.copy?.read}
        </T>
        {chips.length ? (
          <View style={styles.chips}>
            {chips.map((c) => (
              <View key={c} style={[styles.chip, { backgroundColor: alpha(pal.glow, 0.13) }]}>
                <T variant="footnote" style={{ fontWeight: '600' }} color={colors.text}>
                  {c}
                </T>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={{ gap: Space.m }}>
        {k.recentHeart ? (
          <Animated.View entering={FadeInDown.duration(500)}>
            <Glass radius={Radius.l} style={styles.heart}>
              <Icon name="heart" size={16} color={ink(pal.glow, dark)} />
              <T variant="callout" style={{ flex: 1 }}>
                {name} noticed something you did{k.recentHeart.note ? `: “${k.recentHeart.note}”` : '.'}
              </T>
            </Glass>
          </Animated.View>
        ) : null}

        {k.activeSignal ? (
          <SignalCard signal={k.activeSignal} name={name} season={k.season} onAck={() => s.acknowledge(k.activeSignal!.event.at)} />
        ) : null}

        {!quiet ? (
          <NudgeCard
            nudge={k.todayNudge}
            season={k.season}
            {...(k.doneToday ? { done: k.doneToday } : {})}
            snoozed={Boolean(snoozedAny)}
            onDone={() =>
              k.todayNudge &&
              s.log({ key: k.todayNudge.key, nudgeId: k.todayNudge.templateId, kind: k.todayNudge.kind, date: k.today, outcome: 'done', title: k.todayNudge.title })
            }
            onSwap={() =>
              k.todayNudge &&
              s.log({ key: k.todayNudge.key, nudgeId: k.todayNudge.templateId, kind: k.todayNudge.kind, date: k.today, outcome: 'skipped', title: k.todayNudge.title })
            }
            onSnooze={() =>
              k.todayNudge &&
              s.log({ key: k.todayNudge.key, nudgeId: k.todayNudge.templateId, kind: k.todayNudge.kind, date: k.today, outcome: 'snoozed', title: k.todayNudge.title })
            }
            onUndo={() => {
              const entry = k.doneToday ?? snoozedAny;
              if (entry) s.undoLog(entry.key, entry.date);
            }}
          />
        ) : null}
      </View>

      {k.upcoming.length ? (
        <>
          <SectionLabel>Coming up</SectionLabel>
          <Glass radius={Radius.l}>
            {k.upcoming.slice(0, 4).map((n, i) => (
              <View key={n.key}>
                {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.hairline }]} /> : null}
                <Press haptics={false} onPress={() => router.push({ pathname: '/nudge', params: { key: n.key } })} style={styles.upRow}>
                  <View style={styles.upDay}>
                    <T variant="caption" tone="tertiary" style={{ letterSpacing: 0.6 }}>
                      {weekdayName(n.date).slice(0, 3)}
                    </T>
                    <T variant="headline">{Number(n.date.slice(8))}</T>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T variant="callout" numberOfLines={1} style={{ fontWeight: '500' }}>
                      {n.title}
                    </T>
                    <T variant="footnote" tone="tertiary" numberOfLines={1}>
                      {n.targetDate !== n.date ? `Prep for ${weekdayName(n.targetDate)}` : n.why}
                    </T>
                  </View>
                  <Icon name={KIND_ICON[n.kind]} size={15} color={colors.textTertiary} />
                </Press>
              </View>
            ))}
          </Glass>
        </>
      ) : null}

      <SectionLabel>Remember for later</SectionLabel>
      <MentionCapture />
    </Screen>
  );
}

function MentionCapture() {
  const { colors, dark } = useTheme();
  const k = useKairos();
  const add = useStore((s) => s.addMention);
  const mentions = useStore((s) => s.mentions).filter((m) => !m.resolved);
  const [text, setText] = useState('');
  const save = () => {
    if (!text.trim()) return;
    add(text, k.today);
    haptic.success();
    setText('');
  };
  return (
    <Glass radius={Radius.l} style={{ padding: Space.l, gap: Space.m }}>
      <View style={[styles.input, { backgroundColor: alpha(colors.text, 0.05) }]}>
        <Icon name="note" size={16} color={colors.textTertiary} />
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={save}
          placeholder="She mentioned…"
          placeholderTextColor={colors.textTertiary}
          returnKeyType="done"
          style={[styles.inputText, { color: colors.text }]}
        />
        {text ? (
          <Press onPress={save} accessibilityLabel="Save">
            <Icon name="plus" size={18} color={colors.text} />
          </Press>
        ) : null}
      </View>
      <T variant="footnote" tone="tertiary">
        {mentions.length
          ? `${mentions.length} saved. Kairos will bring ${mentions.length === 1 ? 'it' : 'them'} back at the right moment.`
          : 'Things she mentions in passing come back as ideas, days later, when it means the most.'}
      </T>
    </Glass>
  );
}

function Waiting({ name }: { name: string }) {
  return (
    <Screen>
      <View style={[styles.hero, { marginTop: Space.xxxl }]}>
        <Orb season={undefined} size={170} dim />
      </View>
      <T variant="title" center>
        Waiting for {name}
      </T>
      <T variant="callout" tone="secondary" center style={{ marginTop: Space.s }}>
        As soon as she shares her first forecast, your days will start to make sense.
      </T>
    </Screen>
  );
}

function Paused({ name }: { name: string }) {
  return (
    <Screen>
      <View style={[styles.hero, { marginTop: Space.xxxl }]}>
        <Orb season={undefined} size={170} dim />
      </View>
      <T variant="title" center>
        {name} has paused sharing
      </T>
      <T variant="callout" tone="secondary" center style={{ marginTop: Space.s }}>
        Nothing to do but be yourself. Ideas pick up again when she’s ready.
      </T>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 },
  iconButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', justifyContent: 'center', height: 236 },
  titleBlock: { alignItems: 'center', gap: Space.s, marginBottom: Space.xxl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Space.s, marginTop: Space.s },
  chip: { paddingHorizontal: 12, height: 28, borderRadius: 14, justifyContent: 'center' },
  heart: { flexDirection: 'row', alignItems: 'center', gap: Space.m, padding: Space.l },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 72 },
  upRow: { flexDirection: 'row', alignItems: 'center', gap: Space.m, paddingHorizontal: Space.l, paddingVertical: Space.m },
  upDay: { width: 40, alignItems: 'center' },
  input: { flexDirection: 'row', alignItems: 'center', gap: Space.s, borderRadius: Radius.m, paddingHorizontal: Space.m, height: 46 },
  inputText: { flex: 1, fontSize: 16, height: 46 },
});
