import { secureStorage } from './secure-storage';
import { instanceKey } from './known-instances';

/**
 * One session per saved site, so switching between signed-in sites needs no
 * new login. Everything here is a secret (the sid cookie, the password kept
 * for biometric sign-in), so it all lives in the keystore.
 *
 * The live site's cookie is also mirrored into the plain `cookie`/`instanceurl`
 * keys the API client reads on every request (see `activateSite`).
 */
export type SiteSession = {
  cookie: string;
  roles: string[];
  fullName: string | null;
  email: string | null;
  savedAt: number;
};

const sessionKey = (url: string) => `site_session.${instanceKey(url)}`;
const passwordKey = (url: string) => `site_pw.${instanceKey(url)}`;

export const siteSessions = {
  async get(url: string): Promise<SiteSession | null> {
    if (!instanceKey(url)) return null;
    try {
      const raw = await secureStorage.get(sessionKey(url));
      if (!raw) return null;
      const p = JSON.parse(raw) as Partial<SiteSession>;
      if (!p || typeof p.cookie !== 'string' || !p.cookie) return null;
      return {
        cookie: p.cookie,
        roles: Array.isArray(p.roles) ? p.roles : [],
        fullName: p.fullName ?? null,
        email: p.email ?? null,
        savedAt: p.savedAt ?? 0,
      };
    } catch {
      return null;
    }
  },

  async set(url: string, session: Omit<SiteSession, 'savedAt'>): Promise<void> {
    await secureStorage.set(sessionKey(url), JSON.stringify({ ...session, savedAt: Date.now() }));
  },

  /** Sign out of one site: its cookie and roles go, its password backup stays. */
  clear: (url: string) => secureStorage.remove(sessionKey(url)),

  async has(url: string): Promise<boolean> {
    return !!(await siteSessions.get(url));
  },

  getPassword: (url: string) => secureStorage.get(passwordKey(url)),
  setPassword: (url: string, password: string) => secureStorage.set(passwordKey(url), password),
  clearPassword: (url: string) => secureStorage.remove(passwordKey(url)),

  /** Forget a site entirely. */
  async wipe(url: string): Promise<void> {
    await Promise.all([siteSessions.clear(url), siteSessions.clearPassword(url)]);
  },
};
