import { addDays, localToday, type Intent, type ShareLevel } from '@kairos/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { haptic } from '@/platform/haptics';
import { healthAvailable, healthSource, healthSourceName, importFromHealth } from '@/platform/health';
import { useStore } from '@/state/store';
import { Button, Chip, Press } from '@/ui/controls';
import { Glass } from '@/ui/glass';
import { Icon } from '@/ui/icon';
import { Invite } from '@/ui/invite';
import { StepFrame } from '@/ui/steps';
import { T } from '@/ui/text';
import { alpha, Radius, seasonColors, Space, useTheme } from '@/ui/theme';

const TOTAL = 5;
const accent = seasonColors('summer').glow;

export default function HerOnboarding() {
  const s = useStore();
  const { colors } = useTheme();
  const [step, setStep] = useState(0);
  const [manual, setManual] = useState(!healthAvailable());
  const [daysAgo, setDaysAgo] = useState<number>();
  const [length, setLength] = useState(29);
  const [imported, setImported] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const next = () => {
    haptic.tap();
    setStep((x) => x + 1);
  };
  const back = step > 0 ? () => setStep((x) => x - 1) : () => router.back();

  const finish = () => {
    s.finishOnboarding();
    haptic.success();
    router.replace('/her');
  };

  if (step === 0) {
    const connect = async () => {
      setBusy(true);
      setError(undefined);
      try {
        const r = await importFromHealth();
        s.importCycle(r.data, healthSource);
        setImported(r.summary);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not read Health');
        setManual(true);
      } finally {
        setBusy(false);
      }
    };
    const canContinue = Boolean(imported) || daysAgo !== undefined;
    return (
      <StepFrame
        step={0}
        total={TOTAL}
        onBack={back}
        eyebrow="Your rhythm"
        title="Let’s find where you are."
        subtitle="Everything stays on this phone. Only what you choose to share reaches him, encrypted."
        footer={
          <Button
            label="Continue"
            disabled={!canContinue}
            onPress={() => {
              if (!imported && daysAgo !== undefined) s.setStatedCycle(length, addDays(localToday(), -daysAgo));
              next();
            }}
          />
        }>
        {healthAvailable() && !manual ? (
          <Press onPress={connect} disabled={busy} accessibilityLabel={`Connect ${healthSourceName}`}>
            <Glass radius={Radius.xl} style={styles.bigOption}>
              <View style={[styles.optionIcon, { backgroundColor: alpha('#FF6B8A', 0.16) }]}>
                <Icon name="health" size={22} color="#FF6B8A" />
              </View>
              <View style={{ flex: 1 }}>
                <T variant="headline">
                  {imported ? `Connected to ${healthSourceName}` : `Connect ${healthSourceName}`}
                </T>
                <T variant="footnote" tone="secondary">
                  {imported ?? (busy ? 'Reading…' : 'Periods, LH tests and temperature. Read-only. Zero typing.')}
                </T>
              </View>
              {imported ? <Icon name="check" size={18} color={colors.positive} /> : null}
            </Glass>
          </Press>
        ) : null}
        {!imported ? (
          manual ? (
            <View style={{ gap: Space.l }}>
              <T variant="headline">When did your last period start?</T>
              <View style={styles.chips}>
                {[0, 1, 2, 3, 5, 7, 10, 14, 21].map((d) => (
                  <Chip
                    key={d}
                    label={d === 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d} days ago`}
                    selected={daysAgo === d}
                    accent={accent}
                    onPress={() => setDaysAgo(d)}
                  />
                ))}
              </View>
              <T variant="headline" style={{ marginTop: Space.m }}>
                Your cycles usually run about
              </T>
              <View style={styles.stepper}>
                <Press
                  onPress={() => setLength((l) => Math.max(21, l - 1))}
                  style={styles.stepButton}
                  accessibilityLabel="Shorter">
                  <T variant="title2">−</T>
                </Press>
                <T variant="title" style={{ minWidth: 120, textAlign: 'center' }}>
                  {length} days
                </T>
                <Press
                  onPress={() => setLength((l) => Math.min(40, l + 1))}
                  style={styles.stepButton}
                  accessibilityLabel="Longer">
                  <T variant="title2">+</T>
                </Press>
              </View>
              <T variant="footnote" tone="tertiary">
                Not sure? Leave it. Kairos learns your real rhythm within two cycles.
              </T>
            </View>
          ) : (
            <Press onPress={() => setManual(true)} style={{ marginTop: Space.l }}>
              <T variant="label" tone="secondary" center>
                Enter it myself instead
              </T>
            </Press>
          )
        ) : null}
        {error ? (
          <T variant="footnote" color={colors.danger} style={{ marginTop: Space.m }}>
            {error}
          </T>
        ) : null}
      </StepFrame>
    );
  }

  if (step === 1) {
    const options: { v: Intent; title: string; body: string }[] = [
      {
        v: 'trying',
        title: 'Trying for a baby',
        body: 'He’ll know your best days, do his part, and be steady through the wait.',
      },
      { v: 'closer', title: 'Growing closer', body: 'Your seasons shape his care and romance. No pregnancy goal.' },
      {
        v: 'basics',
        title: 'Just the basics',
        body: 'A heads-up around your period, and the support that comes with it.',
      },
    ];
    return (
      <StepFrame
        step={1}
        total={TOTAL}
        onBack={back}
        eyebrow="Why you’re here"
        title="What would help most?"
        footer={<Button label="Continue" onPress={next} />}>
        <View style={{ gap: Space.s }}>
          {options.map((o) => (
            <Choice
              key={o.v}
              title={o.title}
              body={o.body}
              selected={s.intent === o.v}
              onPress={() => s.setIntent(o.v)}
            />
          ))}
        </View>
      </StepFrame>
    );
  }

  if (step === 2) {
    const options: { v: ShareLevel; title: string; body: string }[] = [
      { v: 'period', title: 'Period only', body: 'When it’s due, plus a heads-up before.' },
      { v: 'seasons', title: 'Seasons', body: 'Which of your four seasons you’re in. No fertility numbers.' },
      { v: 'fertility', title: 'Seasons + fertility', body: 'Adds your fertile window and best days.' },
    ];
    return (
      <StepFrame
        step={2}
        total={TOTAL}
        onBack={back}
        eyebrow="Your call"
        title="How much should he see?"
        subtitle="Never your temperatures, tests, notes or a pregnancy result. Change this any time."
        footer={<Button label="Continue" onPress={next} />}>
        <View style={{ gap: Space.s }}>
          {options.map((o) => (
            <Choice
              key={o.v}
              title={o.title}
              body={o.body}
              selected={s.share === o.v}
              onPress={() => s.setShare(o.v)}
            />
          ))}
        </View>
      </StepFrame>
    );
  }

  if (step === 3) {
    const pb = s.playbook;
    return (
      <StepFrame
        step={3}
        total={TOTAL}
        onBack={back}
        eyebrow="Your playbook"
        title="Three things he should know."
        subtitle="Optional, and you can add more later. His ideas get specific when you do."
        footer={
          <Button
            label={pb.flowers || pb.treat || pb.drink ? 'Continue' : 'Skip for now'}
            onPress={next}
            kind={pb.flowers || pb.treat ? 'primary' : 'secondary'}
          />
        }>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: Space.m }}>
          <Labeled
            label="Your name"
            value={pb.name}
            placeholder="What he calls you"
            onChange={(name) => s.updatePlaybook({ name })}
          />
          <Labeled
            label="Favorite flowers"
            value={pb.flowers ?? ''}
            placeholder="Peonies"
            onChange={(flowers) => s.updatePlaybook({ flowers })}
          />
          <Labeled
            label="Go-to treat"
            value={pb.treat ?? ''}
            placeholder="Salted dark chocolate"
            onChange={(treat) => s.updatePlaybook({ treat })}
          />
          <Labeled
            label="Coffee order"
            value={pb.drink ?? ''}
            placeholder="Oat flat white"
            onChange={(drink) => s.updatePlaybook({ drink })}
          />
        </ScrollView>
      </StepFrame>
    );
  }

  return (
    <StepFrame
      step={4}
      total={TOTAL}
      onBack={back}
      eyebrow="Last step"
      title="Invite him."
      footer={
        <>
          <Button label="Done" onPress={finish} />
          <Press onPress={finish} style={{ height: 40, justifyContent: 'center' }}>
            <T variant="label" tone="secondary" center>
              I’ll do this later
            </T>
          </Press>
        </>
      }>
      <Invite onPaired={finish} />
    </StepFrame>
  );
}

function Choice({
  title,
  body,
  selected,
  onPress,
}: {
  title: string;
  body: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Press onPress={onPress} accessibilityLabel={title}>
      <Glass
        radius={Radius.l}
        style={[styles.choice, selected ? { borderColor: alpha(accent, 0.75), borderWidth: 1 } : null]}>
        <View style={[styles.radio, { borderColor: selected ? accent : colors.textTertiary }]}>
          {selected ? <View style={[styles.radioDot, { backgroundColor: accent }]} /> : null}
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <T variant="headline">{title}</T>
          <T variant="footnote" tone="secondary">
            {body}
          </T>
        </View>
      </Glass>
    </Press>
  );
}

function Labeled({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <Glass radius={Radius.l} style={{ paddingHorizontal: Space.l, paddingTop: Space.m }}>
      <T variant="caption" tone="tertiary">
        {label}
      </T>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        style={{ color: colors.text, fontSize: 17, height: 44 }}
      />
    </Glass>
  );
}

const styles = StyleSheet.create({
  bigOption: { flexDirection: 'row', alignItems: 'center', gap: Space.m, padding: Space.xl },
  optionIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.s },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Space.l },
  stepButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(127,127,127,0.12)',
  },
  choice: { flexDirection: 'row', alignItems: 'center', gap: Space.m, padding: Space.l },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
});
