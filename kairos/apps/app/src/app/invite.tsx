import { router } from 'expo-router';
import { View } from 'react-native';

import { Invite } from '@/ui/invite';
import { Sheet } from '@/ui/sheet';

/** Her side of pairing, as a sheet: the code for him to scan. */
export default function InviteSheet() {
  return (
    <Sheet title="Invite him">
      <View>
        <Invite onPaired={() => router.back()} />
      </View>
    </Sheet>
  );
}
