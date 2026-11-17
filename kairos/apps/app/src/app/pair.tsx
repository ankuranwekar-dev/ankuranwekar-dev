import * as Linking from 'expo-linking';
import { Redirect, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { haptic } from '@/platform/haptics';
import { configureNotifications } from '@/platform/notifications';
import { joinInvite, relayConfigured } from '@/platform/relay';
import { useStore } from '@/state/store';
import { Orb } from '@/ui/orb';
import { Screen } from '@/ui/screen';
import { T } from '@/ui/text';
import { Space } from '@/ui/theme';

/**
 * Where a pairing link lands when he taps it instead of scanning: the key is in the link's
 * fragment, which only this phone ever sees.
 */
export default function Pair() {
  const url = Linking.useURL();
  const s = useStore();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!url || !url.includes('#k1.') || started.current) return;
    started.current = true;
    joinInvite(url)
      .then(({ pairId, safety }) => {
        s.setRole('him');
        s.setPairing({ status: 'paired', pairId, safety, pairedAt: new Date().toISOString() });
        s.finishOnboarding();
        haptic.success();
        configureNotifications().catch(() => {});
        router.replace('/today');
      })
      .catch(() => setFailed(true));
  }, [url, s]);

  if (!relayConfigured || failed) return <Redirect href={relayConfigured ? '/scan' : '/'} />;
  return (
    <Screen season="autumn" scroll={false}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Orb season="autumn" size={150} breath={2.4} />
        <T variant="title2" center style={{ marginTop: Space.xxl }}>
          Pairing…
        </T>
      </View>
    </Screen>
  );
}
