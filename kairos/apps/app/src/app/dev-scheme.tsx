import { Redirect, useLocalSearchParams } from 'expo-router';
import { Appearance } from 'react-native';

import { DEV_READ } from '@/platform/dev';

/**
 * Developer check, compiled in only when EXPO_PUBLIC_DEV_READ=1: sets the app's own light or dark appearance (the
 * phone's setting is left alone), then goes to `to`. Lets both themes be captured on a device without Settings.
 */
export default function DevScheme() {
  const { mode, to } = useLocalSearchParams<{ mode?: string; to?: string }>();
  if (!DEV_READ) return <Redirect href="/" />;
  Appearance.setColorScheme(mode === 'light' ? 'light' : mode === 'dark' ? 'dark' : 'unspecified');
  return <Redirect href={(to ?? '/welcome') as '/welcome'} />;
}
