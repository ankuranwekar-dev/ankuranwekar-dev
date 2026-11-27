import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/** Haptics that quietly do nothing where unsupported. */
export const haptic = {
  tap: () => Platform.OS !== 'web' && Haptics.selectionAsync().catch(() => {}),
  soft: () => Platform.OS !== 'web' && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {}),
  success: () =>
    Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warning: () =>
    Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
};
