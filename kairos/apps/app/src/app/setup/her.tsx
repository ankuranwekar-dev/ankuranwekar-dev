import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { haptic } from '@/platform/haptics';
import { healthAvailable, healthSource, healthSourceName, importFromHealth } from '@/platform/health';
import { useStore } from '@/state/store';
import { Tile } from '@/ui/controls';
import { SetupFrame } from '@/ui/setup-frame';
import { T } from '@/ui/text';
import { seasonColors, Space, useTheme } from '@/ui/theme';

/** Her first step: where her cycle comes from. */
export default function HerSetup() {
  const importCycle = useStore((s) => s.importCycle);
  const { colors } = useTheme();
  const [error, setError] = useState<string>();

  const fromHealth = async () => {
    setError(undefined);
    try {
      const res = await importFromHealth();
      if (res.data.periods.length === 0) {
        setError(`${healthSourceName} has no periods logged yet.`);
        return;
      }
      importCycle(res.data, healthSource);
      haptic.success();
      router.push('/setup/share');
    } catch {
      setError(`Could not read ${healthSourceName}.`);
    }
  };

  return (
    <SetupFrame title="Start with your cycle." subtitle="It stays on this phone.">
      <View style={{ gap: Space.m }}>
        {healthAvailable() ? (
          <Tile
            icon="health"
            title={healthSourceName}
            caption="Use what you already track"
            accent={seasonColors('spring').glow}
            onPress={fromHealth}
          />
        ) : null}
        <Tile
          icon="camera"
          title="A photo or screenshot"
          caption="Of any period app's calendar"
          accent={seasonColors('summer').glow}
          onPress={() => router.push({ pathname: '/import', params: { mode: 'screenshot', next: 'share' } })}
        />
        <Tile
          icon="day"
          title="Pick a date"
          caption="The day your last period started"
          accent={seasonColors('winter').glow}
          onPress={() => router.push({ pathname: '/import', params: { mode: 'date', next: 'share' } })}
        />
        {error ? (
          <T variant="footnote" color={colors.danger}>
            {error}
          </T>
        ) : null}
      </View>
    </SetupFrame>
  );
}
