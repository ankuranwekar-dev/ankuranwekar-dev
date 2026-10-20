import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Key material lives in the Keychain (iOS) / Keystore-backed storage
 * (Android), readable only after first unlock and never backed up to iCloud.
 * The web app can only use localStorage, which is why the web experience is
 * positioned as a companion, not the place to keep the keys long-term.
 */
export async function secureGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(`kairos.secure.${key}`) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
}

export async function secureSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(`kairos.secure.${key}`, value);
    } catch {
      /* private mode: keys stay in memory for this session */
    }
    return;
  }
  await SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY });
}

export async function secureDelete(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.removeItem(`kairos.secure.${key}`);
    } catch {
      /* ignore */
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
