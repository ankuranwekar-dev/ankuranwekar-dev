import { Redirect } from 'expo-router';

import { useStore } from '@/state/store';

export default function Index() {
  const role = useStore((s) => s.role);
  const onboarded = useStore((s) => s.onboarded);
  if (!role || !onboarded) return <Redirect href="/welcome" />;
  return <Redirect href={role === 'him' ? '/him' : '/her'} />;
}
