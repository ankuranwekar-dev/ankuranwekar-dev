import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { haptic } from '@/platform/haptics';
import { checkForJoin, relayConfigured, startInvite } from '@/platform/relay';
import { useStore } from '@/state/store';

import { Button } from './controls';
import { Glass } from './glass';
import { T } from './text';
import { Radius, Space, useTheme } from './theme';

/**
 * Her side of pairing: a QR code for him to scan in person (the best path —
 * the secret never touches a network) or a link to send.
 */
export function Invite({ onPaired }: { onPaired?: () => void }) {
  const { colors } = useTheme();
  const pairing = useStore((s) => s.pairing);
  const setPairing = useStore((s) => s.setPairing);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!relayConfigured || pairing.status !== 'none') return;
    startInvite()
      .then(({ link, pairId }) => setPairing({ status: 'inviting', invite: link, pairId }))
      .catch(() => setError('Couldn’t reach the pairing service. Check the connection and try again.'));
  }, [pairing.status, setPairing]);

  useEffect(() => {
    if (pairing.status !== 'inviting') return;
    const id = setInterval(async () => {
      const safety = await checkForJoin().catch(() => null);
      if (safety) {
        haptic.success();
        setPairing({ ...pairing, status: 'paired', safety, pairedAt: new Date().toISOString() });
        onPaired?.();
      }
    }, 3000);
    return () => clearInterval(id);
  }, [pairing, setPairing, onPaired]);

  const link = pairing.invite ?? 'kairos://pair#demo';

  return (
    <Glass radius={Radius.xl} style={styles.card}>
      <View style={[styles.qr, { backgroundColor: '#FFFFFF' }]}>
        <QRCode value={link} size={176} color="#1E1519" backgroundColor="#FFFFFF" ecl="M" />
      </View>
      <T variant="headline" center>
        {pairing.status === 'inviting' ? 'Waiting for him to scan…' : 'Have him scan this'}
      </T>
      <T variant="footnote" tone="secondary" center style={{ maxWidth: 300 }}>
        The code carries the key. In person is best.
      </T>
      <View style={styles.row}>
        <Button
          label={copied ? 'Copied' : 'Copy link'}
          kind="secondary"
          compact
          onPress={async () => {
            await Clipboard.setStringAsync(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          }}
        />
        {Platform.OS !== 'web' ? (
          <Button
            label="Send link"
            kind="secondary"
            compact
            onPress={() => Share.share({ message: `Join me on Kairos: ${link}` })}
          />
        ) : null}
      </View>
      {!relayConfigured ? (
        <T variant="footnote" tone="tertiary" center>
          Pairing is switched off in this build.
        </T>
      ) : null}
      {error ? (
        <T variant="footnote" center color={colors.danger}>
          {error}
        </T>
      ) : null}
    </Glass>
  );
}

const styles = StyleSheet.create({
  card: { padding: Space.xl, alignItems: 'center', gap: Space.m },
  qr: { padding: 14, borderRadius: 20 },
  row: { flexDirection: 'row', gap: Space.s },
});
