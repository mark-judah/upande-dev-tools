import { storage, StorageKeys } from '@/core/storage';
import { api } from '@/core/api/client';
import { loginRequest, probeBaseUrl } from './api';
import { fetchCurrentUserRoles } from './roles-api';
import { instanceLabel, knownInstances } from './known-instances';
import { activateSite, isOtherServer } from './server-change';
import { siteSessions } from './site-sessions';
import { cleanSiteInput } from './site-check';

/** The stock /api/method/login response's `full_name` is computed as
 *  `first_name + last_name` server-side (frappe/auth.py), which reads as an
 *  empty string -- not null, so `?? email` below never catches it -- for
 *  any User whose name was set via the `full_name` field directly rather
 *  than first/last name (confirmed live: real accounts here). Read the real
 *  field straight off the User doctype instead, same fix already applied in
 *  upande-production's auth-api.ts. */
async function fetchRealFullName(email: string): Promise<string | null> {
  try {
    const body = await api<{ message?: { full_name?: string }; data?: { full_name?: string } }>({
      method: 'GET',
      url: `/api/method/frappe.client.get_value?doctype=User&filters={"name":"${email}"}&fieldname=["full_name"]`,
    });
    const m = body?.message ?? body?.data;
    return (m && m.full_name) || null;
  } catch {
    return null;
  }
}

export type LoginOutcome =
  /** `switched`: the app was on another server before this login. */
  | { ok: true; fullName: string; instanceUrl: string; roles: string[]; switched: boolean }
  | { ok: false; error: string };

function extractSidCookie(setCookie: string | null): string | null {
  if (!setCookie) return null;
  // Frappe sends multiple cookies in one Set-Cookie line concatenated.
  // We forward the entire header string back to the server on subsequent calls.
  if (setCookie.includes('sid=')) return setCookie;
  return null;
}

export const authRepository = {
  /**
   * Sign in to a site. Nothing about the live site changes until the server
   * accepts the password: a wrong address, a wrong password or a dropped
   * connection leaves the previous site and its session exactly as they were.
   * On success the site's own session is saved, then the site becomes the live one.
   */
  async login(email: string, password: string, bareUrl: string): Promise<LoginOutcome> {
    const typed = cleanSiteInput(bareUrl);
    if (!typed) return { ok: false, error: 'Enter the site address first.' };

    let fullUrl: string;
    try {
      fullUrl = await probeBaseUrl(typed);
    } catch {
      return { ok: false, error: `Couldn't reach ${instanceLabel(typed)}.` };
    }
    const res = await loginRequest(fullUrl, email, password);

    if (res.status === 200) {
      const cookie = extractSidCookie(res.setCookie);
      if (!cookie) {
        return {
          ok: false,
          error: `${instanceLabel(fullUrl)} did not answer like a Frappe server with Upande Dev Tools installed. Check the address and port (the Frappe web port, not Metro's 8081).`,
        };
      }
      let fullName = res.body.full_name || email;
      const switched = await isOtherServer(fullUrl);
      // This site's own session and password backup (keystore) first; then it goes live.
      await siteSessions.setPassword(fullUrl, password);
      const session = { cookie, roles: [] as string[], fullName: fullName as string | null, email };
      await siteSessions.set(fullUrl, session);
      await activateSite(fullUrl, { ...session, savedAt: Date.now() });

      // The login response's own full_name is often a blank string (see
      // fetchRealFullName's comment) -- now that the cookie is live, an
      // authenticated follow-up can read the real field. Non-fatal.
      try {
        const real = await fetchRealFullName(email);
        if (real && real !== fullName) {
          fullName = real;
          await storage.set(StorageKeys.fullName, fullName);
        }
      } catch {
        // ignore — greeting falls back to the login response's own value
      }

      // Roles are non-fatal: login still succeeds and the UI treats none as "no special permissions".
      let roles: string[] = [];
      try {
        roles = await fetchCurrentUserRoles();
        await storage.set(StorageKeys.userRoles, JSON.stringify(roles));
      } catch {
        // ignore
      }
      await siteSessions.set(fullUrl, { cookie, roles, fullName, email });
      await knownInstances
        .remember(fullUrl, email, fullName && fullName !== email ? fullName : null)
        .catch(() => {});
      return { ok: true, fullName, instanceUrl: fullUrl, roles, switched };
    }

    if (res.status === 401) {
      return { ok: false, error: 'Email or password is incorrect.' };
    }
    if (res.status === 0) {
      return { ok: false, error: `Couldn't reach ${instanceLabel(fullUrl)}. Check your connection and the address.` };
    }
    if (res.status === 503) {
      return { ok: false, error: 'The server is being updated. Please try again in a few minutes.' };
    }
    const message = res.body?.message ?? 'Login failed, try again later.';
    return { ok: false, error: message };
  },

  /** Wipe what the live site keeps in plain storage (sessions of saved sites are handled by the store). */
  async logout(): Promise<void> {
    await storage.clearExcept([
      StorageKeys.emailBackup,
      StorageKeys.instanceUrlBackup,
      StorageKeys.knownInstances,
      StorageKeys.loginDraft,
    ]);
  },

  async loadBackupCredentials(): Promise<{ email: string | null; url: string | null }> {
    const [email, url] = await Promise.all([
      storage.get(StorageKeys.emailBackup),
      storage.get(StorageKeys.instanceUrlBackup),
    ]);
    return { email, url };
  },

  /** Everything needed to re-authenticate one site after a biometric prompt.
   *  Nulls when any piece is missing. */
  async loadFullCredentials(url: string): Promise<{
    email: string | null;
    password: string | null;
    url: string | null;
  }> {
    const [known, password] = await Promise.all([knownInstances.get(url), siteSessions.getPassword(url)]);
    return { email: known?.email ?? null, password, url: known?.url ?? url };
  },

  async loadRoles(): Promise<string[]> {
    const raw = await storage.get(StorageKeys.userRoles);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  async hasSession(): Promise<boolean> {
    const cookie = await storage.get(StorageKeys.cookie);
    return !!cookie;
  },
};
