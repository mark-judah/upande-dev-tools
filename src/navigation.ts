export const DEV = ['Dev Team', 'Projects Manager', 'System Manager'];
export const PM = ['Projects Manager', 'System Manager'];

export type MoreItem = { label: string; href: string; icon: string; hint?: string; roles?: string[] };
export type MoreGroup = { title: string; items: MoreItem[] };

/** The "More" tab: everything that is not one of the four daily tabs. `roles` filters by the signed-in user. */
export const MORE_GROUPS: MoreGroup[] = [
  {
    title: 'Decide',
    items: [
      { label: 'Review queue', href: '/review-queue', icon: 'checkmark-done-outline', hint: 'Requests waiting for a decision', roles: PM },
      { label: 'PM dashboard', href: '/pm-dashboard', icon: 'stats-chart-outline', hint: 'Portfolio, risks and team load', roles: PM },
    ],
  },
  {
    title: 'Code and servers',
    items: [
      { label: 'Repos', href: '/repos', icon: 'git-branch-outline', hint: 'Which apps are behind or dirty', roles: DEV },
      { label: 'Activity', href: '/activity', icon: 'pulse-outline', hint: 'Backups, git checks, errors', roles: DEV },
      { label: 'Snapshots', href: '/snapshots', icon: 'camera-outline', hint: 'Saved code and scripts', roles: DEV },
    ],
  },
  {
    title: 'You',
    items: [
      { label: 'Achievements', href: '/achievements', icon: 'trophy-outline', hint: 'Points, streak and badges', roles: DEV },
      { label: 'Notifications', href: '/notification-settings', icon: 'notifications-outline', roles: DEV },
      { label: 'Settings', href: '/settings', icon: 'settings-outline' },
      { label: 'App updates and support', href: '/mobile-kit/settings', icon: 'cloud-download-outline', hint: 'Updates, report a problem' },
    ],
  },
];

export function hasDevAccess(roles: string[]): boolean {
  return DEV.some((r) => roles.includes(r));
}

export function visibleGroups(roles: string[]): MoreGroup[] {
  return MORE_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.roles || i.roles.some((r) => roles.includes(r))),
  })).filter((g) => g.items.length > 0);
}
