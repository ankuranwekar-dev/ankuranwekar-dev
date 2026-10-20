import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { haptic } from '@/platform/haptics';
import { configureNotifications } from '@/platform/notifications';
import { joinInvite, relayConfigured } from '@/platform/relay';
import { useStore } from '@/state/store';
import { Button, Chip, Press, Segmented } from '@/ui/controls';
import { Glass } from '@/ui/glass';
import { Icon } from '@/ui/icon';
import { StepFrame } from '@/ui/steps';
import { T } from '@/ui/text';
import { alpha, Radius, seasonColors, Space, useTheme } from '@/ui/theme';

const TOTAL = 3;
const accent = seasonColors('autumn').glow;
const TIMES = ['07:30', '08:30', '12:00', '17:30'];

export default function HimOnboarding() {
  const s = useStore();
  const { colors } = useTheme();
  const [step, setStep] = useState(0);
  const [link, setLink] = useState('');
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const join = async (value: string) => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const { pairId, safety } = await joinInvite(value.trim());
      s.setPairing({ status: 'paired', pairId, safety, pairedAt: new Date().toISOString() });
      haptic.success();
      setScanning(false);
      setStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code didn’t work');
    } finally {
      setBusy(false);
    }
  };

  if (step === 0) {
    return (
      <StepFrame
        step={0}
        total={TOTAL}
        onBack={() => router.back()}
        eyebrow="Pair"
        title="Scan the code on her phone."
        subtitle="She’ll find it under Sharing. It carries an encryption key, so in person is best."
        footer={
          !relayConfigured ? (
            <>
              <Button
                label="Try the demo instead"
                icon="sparkles"
                onPress={() => {
                  s.startDemo('him');
                  router.replace('/him');
                }}
              />
              <T variant="footnote" tone="tertiary" center>
                This build has no relay configured, so real pairing is off.
              </T>
            </>
          ) : null
        }>
        <View style={{ gap: Space.l }}>
          {Platform.OS !== 'web' ? (
            scanning && permission?.granted ? (
              <View style={styles.camera}>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={({ data }) => data.includes('#k1.') && join(data)}
                />
                <View style={[styles.reticle, { borderColor: accent }]} />
              </View>
            ) : (
              <Press
                accessibilityLabel="Scan code"
                onPress={async () => {
                  const p = permission?.granted ? permission : await requestPermission();
                  if (p.granted) setScanning(true);
                }}>
                <Glass radius={Radius.xl} style={styles.scanCard}>
                  <View style={[styles.scanIcon, { backgroundColor: alpha(accent, 0.16) }]}>
                    <Icon name="scan" size={28} color={accent} />
                  </View>
                  <T variant="headline">Open camera</T>
                </Glass>
              </Press>
            )
          ) : null}
          <Glass radius={Radius.l} style={styles.paste}>
            <Icon name="link" size={16} color={colors.textTertiary} />
            <TextInput
              value={link}
              onChangeText={setLink}
              placeholder="…or paste the link she sent"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.pasteInput, { color: colors.text }]}
            />
            {link ? <Button label={busy ? '…' : 'Join'} compact accent={accent} onPress={() => join(link)} /> : null}
          </Glass>
          {error ? (
            <T variant="footnote" color={colors.danger}>
              {error}
            </T>
          ) : null}
        </View>
      </StepFrame>
    );
  }

  if (step === 1) {
    return (
      <StepFrame
        step={1}
        total={TOTAL}
        eyebrow="Paired"
        title="Check these match."
        subtitle="Her phone shows the same four. If they match, nobody is in the middle. Not even us."
        footer={<Button label="They match" onPress={() => setStep(2)} />}>
        <Glass radius={Radius.xl} style={styles.safety}>
          {(s.pairing.safety ?? []).map((e, i) => (
            <T key={i} style={{ fontSize: 44, lineHeight: 52 }}>
              {e}
            </T>
          ))}
        </Glass>
      </StepFrame>
    );
  }

  return (
    <StepFrame
      step={2}
      total={TOTAL}
      onBack={() => setStep(1)}
      eyebrow="Your rhythm"
      title="When should ideas arrive?"
      subtitle="One a day at most, never on her lock screen, never anything that gives her away on yours."
      footer={
        <Button
          label="Start"
          onPress={async () => {
            await configureNotifications().catch(() => false);
            s.finishOnboarding();
            haptic.success();
            router.replace('/him');
          }}
        />
      }>
      <View style={{ gap: Space.xl }}>
        <Glass radius={Radius.l} style={{ paddingHorizontal: Space.l, paddingTop: Space.m }}>
          <T variant="caption" tone="tertiary">
            Your name
          </T>
          <TextInput
            value={s.hisName}
            onChangeText={s.setHisName}
            placeholder="So she knows it’s you"
            placeholderTextColor={colors.textTertiary}
            style={{ color: colors.text, fontSize: 17, height: 44 }}
          />
        </Glass>
        <View style={{ gap: Space.s }}>
          <T variant="headline">Daily idea at</T>
          <View style={styles.chips}>
            {TIMES.map((t) => (
              <Chip
                key={t}
                label={t}
                selected={s.prefs.notifyAt === t}
                accent={accent}
                onPress={() => s.updatePrefs({ notifyAt: t })}
              />
            ))}
          </View>
        </View>
        <View style={{ gap: Space.s }}>
          <T variant="headline">How often</T>
          <Segmented
            value={s.prefs.cadence}
            onChange={(cadence) => s.updatePrefs({ cadence })}
            options={[
              { value: 'light', label: '3 a week' },
              { value: 'steady', label: '5 a week' },
              { value: 'devoted', label: 'Daily' },
            ]}
          />
        </View>
        <View style={{ gap: Space.s }}>
          <T variant="headline">Spend comfort</T>
          <Segmented
            value={String(s.prefs.budget) as '0' | '1' | '2' | '3'}
            onChange={(v) => s.updatePrefs({ budget: Number(v) as 0 | 1 | 2 | 3 })}
            options={[
              { value: '0', label: 'Free' },
              { value: '1', label: '$' },
              { value: '2', label: '$$' },
              { value: '3', label: '$$$' },
            ]}
          />
        </View>
      </View>
    </StepFrame>
  );
}

const styles = StyleSheet.create({
  camera: { height: 320, borderRadius: Radius.xl, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  reticle: { width: 200, height: 200, borderWidth: 2, borderRadius: 28 },
  scanCard: { alignItems: 'center', gap: Space.m, paddingVertical: Space.xxxl },
  scanIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  paste: { flexDirection: 'row', alignItems: 'center', gap: Space.s, paddingHorizontal: Space.l, paddingVertical: 6 },
  pasteInput: { flex: 1, fontSize: 16, height: 44 },
  safety: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: Space.xxl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.s },
});
