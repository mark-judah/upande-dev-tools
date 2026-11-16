export const DEV = ['Dev Team', 'Projects Manager', 'System Manager'];
export const PM = ['Projects Manager', 'System Manager'];

export type NavItem = { label: string; href: string; icon: string; roles?: string[] };
export type NavGroup = { title?: string; items: NavItem[] };

/** The sidebar. The first group is the four main tabs; `roles` filters by the signed-in user. */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { label: 'Today', href: '/', icon: 'sunny-outline', roles: DEV },
      { label: 'Work', href: '/backlog', icon: 'list-outline', roles: DEV },
      { label: 'Requests', href: '/requests', icon: 'chatbox-ellipses-outline', roles: DEV },
      { label: 'Ship', href: '/deployments', icon: 'rocket-outline', roles: DEV },
    ],
  },
  {
    title: 'Decide',
    items: [
      { label: 'Review queue', href: '/review-queue', icon: 'checkmark-done-outline', roles: PM },
      { label: 'Projects', href: '/projects', icon: 'folder-open-outline', roles: PM },
      { label: 'PM dashboard', href: '/pm-dashboard', icon: 'stats-chart-outline', roles: PM },
    ],
  },
  {
    title: 'Code and servers',
    items: [
      { label: 'Repos', href: '/repos', icon: 'git-branch-outline', roles: DEV },
      { label: 'Activity', href: '/activity', icon: 'pulse-outline', roles: DEV },
      { label: 'Snapshots', href: '/snapshots', icon: 'camera-outline', roles: DEV },
    ],
  },
  {
    title: 'IT workstation',
    items: [
      { label: 'IT home', href: '/it', icon: 'pulse', roles: DEV },
      { label: 'Crashes', href: '/it/crashes', icon: 'bug-outline', roles: DEV },
      { label: 'Devices', href: '/it/devices', icon: 'phone-portrait-outline', roles: DEV },
      { label: 'Support inbox', href: '/it/support', icon: 'chatbubbles-outline', roles: DEV },
      { label: 'Apps and releases', href: '/it/apps', icon: 'apps-outline', roles: DEV },
      { label: 'People and access', href: '/it/people', icon: 'people-outline', roles: DEV },
      { label: 'Server pulse', href: '/it/server', icon: 'hardware-chip-outline', roles: DEV },
      { label: 'IT data source', href: '/it-source', icon: 'swap-horizontal-outline', roles: DEV },
    ],
  },
  {
    title: 'You',
    items: [
      { label: 'Notifications', href: '/notification-settings', icon: 'notifications-outline', roles: DEV },
      { label: 'App updates and support', href: '/mobile-kit/settings', icon: 'cloud-download-outline' },
    ],
  },
];

/** Routes that are tabs: the drawer switches to them instead of stacking another screen. */
export const TAB_HREFS = ['/', '/backlog', '/requests', '/deployments'];

export function hasDevAccess(roles: string[]): boolean {
  return DEV.some((r) => roles.includes(r));
}

export function visibleGroups(roles: string[]): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.roles || i.roles.some((r) => roles.includes(r))),
  })).filter((g) => g.items.length > 0);
}
