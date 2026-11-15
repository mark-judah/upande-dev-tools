export type DrawerItem = {
  label: string;
  /** Expo Router href, e.g. "/backlog". */
  href: string;
  /** Ionicons name. */
  icon: string;
  /** Show only when the signed-in user has one of these roles. Omit for everyone. */
  roles?: string[];
};
