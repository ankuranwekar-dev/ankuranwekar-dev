import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { haptic } from '@/platform/haptics';
import { configureNotifications } from '@/platform/notifications';
import { joinInvite } from '@/platform/relay';
import { useStore } from '@/state/store';
import { Button } from '@/ui/controls';
import { Icon } from '@/ui/icon';
import { SetupFrame } from '@/ui/setup-frame';
import { T } from '@/ui/text';
import { alpha, Radius, seasonColors, Space, useTheme } from '@/ui/theme';

const accent = seasonColors('autumn').glow;

/** His side of pairing: point the camera at the code on her phone, or paste the link she sent. */
export default function Scan() {
  const s = useStore();
  const { colors } = useTheme();
  const [link, setLink] = useState('');
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
      s.finishOnboarding();
      haptic.success();
      configureNotifications().catch(() => {});
      router.dismissTo('/today');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code didn’t work.');
    } finally {
      setBusy(false);
    }
  };

  const camera = Platform.OS !== 'web';

  return (
    <SetupFrame title="Scan her code." subtitle="She’ll find it in Tender, under her name.">
      <View style={{ gap: Space.l }}>
        {camera ? (
          permission?.granted ? (
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
            <Button label="Open the camera" icon="scan" accent={accent} onPress={() => requestPermission()} />
          )
        ) : null}
        <View style={[styles.paste, { backgroundColor: alpha(colors.text, 0.06) }]}>
          <Icon name="link" size={16} color={colors.textTertiary} />
          <TextInput
            value={link}
            onChangeText={setLink}
            placeholder="Or paste her link"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: colors.text }]}
          />
          {link ? <Button label={busy ? '…' : 'Join'} compact accent={accent} onPress={() => join(link)} /> : null}
        </View>
        {error ? (
          <T variant="footnote" color={colors.danger}>
            {error}
          </T>
        ) : null}
      </View>
    </SetupFrame>
  );
}

const styles = StyleSheet.create({
  camera: { height: 300, borderRadius: Radius.xl, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  reticle: { width: 190, height: 190, borderRadius: 28, borderWidth: 3 },
  paste: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.s,
    borderRadius: Radius.l,
    paddingHorizontal: Space.l,
    minHeight: 54,
  },
  input: { flex: 1, fontSize: 16, height: 54 },
});
