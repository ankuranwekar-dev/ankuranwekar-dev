import * as Apple from 'expo-apple-authentication';

import { useTheme } from './theme';

/** Apple's own button, as their guidelines require: the system draws it, in black or white to suit the page. */
export function AppleButton({ onPress }: { onPress: () => void }) {
  const { dark } = useTheme();
  return (
    <Apple.AppleAuthenticationButton
      buttonType={Apple.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={dark ? Apple.AppleAuthenticationButtonStyle.WHITE : Apple.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={25}
      style={{ height: 50, width: '100%' }}
      onPress={onPress}
    />
  );
}
