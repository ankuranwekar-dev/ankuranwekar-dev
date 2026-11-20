import { router } from 'expo-router';
import { View } from 'react-native';

import { relayConfigured } from '@/platform/relay';
import { Tile } from '@/ui/controls';
import { SetupFrame } from '@/ui/setup-frame';
import { seasonColors, Space } from '@/ui/theme';

/** His whole setup: choose how to learn her cycle. Each choice is one more screen, then he is in. */
export default function HimSetup() {
  return (
    <SetupFrame title="Sync with her cycle." subtitle="Pick whichever is easiest.">
      <View style={{ gap: Space.m }}>
        <Tile
          icon="camera"
          title="Her calendar"
          caption="Photograph her phone, or use a screenshot"
          accent={seasonColors('summer').glow}
          onPress={() => router.push({ pathname: '/import', params: { mode: 'screenshot', next: 'today' } })}
        />
        {relayConfigured ? (
          <Tile
            icon="scan"
            title="Scan her code"
            caption="If she has Tender too"
            accent={seasonColors('autumn').glow}
            onPress={() => router.push('/scan')}
          />
        ) : null}
        <Tile
          icon="day"
          title="Pick a date"
          caption="The day her last period started"
          accent={seasonColors('winter').glow}
          onPress={() => router.push({ pathname: '/import', params: { mode: 'date', next: 'today' } })}
        />
      </View>
    </SetupFrame>
  );
}
