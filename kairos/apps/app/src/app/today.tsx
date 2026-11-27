import { Redirect } from 'expo-router';

import { HerToday } from '@/screens/her-today';
import { HimToday } from '@/screens/him-today';
import { useStore } from '@/state/store';

/** The whole app is this one screen; which one depends on whose phone it is. */
export default function Today() {
  const role = useStore((s) => s.role);
  const onboarded = useStore((s) => s.onboarded);
  if (!onboarded || !role) return <Redirect href="/welcome" />;
  return role === 'her' ? <HerToday /> : <HimToday />;
}
