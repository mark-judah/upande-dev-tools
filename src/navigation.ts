import type { DrawerItem } from '@/core/ui/drawer-types';

export const DEV = ['Dev Team', 'Projects Manager', 'System Manager'];
export const PM = ['Projects Manager', 'System Manager'];

/** Every drawer entry; `roles` filters by the signed-in user's roles. */
export const DRAWER: DrawerItem[] = [
  { label: 'My Day', href: '/', icon: 'sunny-outline', roles: DEV },
  { label: 'Backlog', href: '/backlog', icon: 'list-outline', roles: DEV },
  { label: 'Deployments', href: '/deployments', icon: 'rocket-outline', roles: DEV },
  { label: 'Repos', href: '/repos', icon: 'git-branch-outline', roles: DEV },
  { label: 'Achievements', href: '/achievements', icon: 'trophy-outline', roles: DEV },
  { label: 'Review Queue', href: '/review-queue', icon: 'checkmark-done-outline', roles: PM },
  { label: 'PM Dashboard', href: '/pm-dashboard', icon: 'stats-chart-outline', roles: PM },
  { label: 'Activity', href: '/activity', icon: 'pulse-outline', roles: DEV },
  { label: 'Snapshots', href: '/snapshots', icon: 'camera-outline', roles: DEV },
  { label: 'Notifications', href: '/notification-settings', icon: 'notifications-outline', roles: DEV },
];

export function drawerFor(roles: string[]): DrawerItem[] {
  return DRAWER.filter((i) => !i.roles || i.roles.some((r) => roles.includes(r)));
}
