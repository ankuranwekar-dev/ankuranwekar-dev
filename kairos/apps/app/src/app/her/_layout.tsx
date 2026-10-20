import { RoleTabs } from '@/ui/tabs';

export default function HerLayout() {
  return (
    <RoleTabs
      tabs={[
        { name: 'index', href: '/her', label: 'Today', icon: 'today' },
        { name: 'playbook', href: '/her/playbook', label: 'Playbook', icon: 'her' },
        { name: 'sharing', href: '/her/sharing', label: 'Sharing', icon: 'sharing' },
      ]}
    />
  );
}
