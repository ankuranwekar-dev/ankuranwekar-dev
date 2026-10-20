import { useKairos } from '@/state/kairos';
import { useStore } from '@/state/store';
import { RoleTabs } from '@/ui/tabs';

export default function HimLayout() {
  const k = useKairos();
  const partner = useStore((s) => s.pairing.partnerName);
  const name = k.snapshot?.playbook.name || partner || 'Her';
  return (
    <RoleTabs
      tabs={[
        { name: 'index', href: '/him', label: 'Today', icon: 'today' },
        { name: 'rhythm', href: '/him/rhythm', label: 'Rhythm', icon: 'rhythm' },
        { name: 'her', href: '/him/her', label: name, icon: 'her' },
      ]}
    />
  );
}
