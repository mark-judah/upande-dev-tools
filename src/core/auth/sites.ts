import { knownInstances, type KnownInstance } from './known-instances';
import { siteSessions } from './site-sessions';

/** A saved site with whether this device holds a session for it. */
export type SiteRow = KnownInstance & { signedIn: boolean };

export async function loadSites(): Promise<SiteRow[]> {
  const list = await knownInstances.list();
  return Promise.all(list.map(async (site) => ({ ...site, signedIn: await siteSessions.has(site.url) })));
}

/** "Just now", "5 min ago", "3 h ago", "Yesterday", "4 d ago", then the date. */
export function relativeTime(ts: number | null | undefined, now = Date.now()): string {
  if (!ts) return '';
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 14) return `${d} d ago`;
  return new Date(ts).toLocaleDateString();
}
