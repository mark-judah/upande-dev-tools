import { create } from 'zustand';
import { authRepository } from './repository';
import { storage, StorageKeys } from '@/core/storage';
import * as Biometric from '@/core/biometric';
import { reportInstall } from '@/core/version/install-register';
import { activateSite } from './server-change';
import { instanceKey, knownInstances } from './known-instances';
import { siteSessions } from './site-sessions';
import { verifySession } from './site-check';
import { loginDraft } from './login-draft';
import { consumeInstanceSwitched, restartForInstance } from './restart';

/** How long a switching sign-in waits for its register report before restarting. */
const LOGIN_REPORT_WAIT_MS = 3000;
/** How long to wait for a requested reload to take this JS down. */
const RELOAD_GRACE_MS = 5000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, sleep(ms).then(() => null)]);
}

type AuthState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;
  fullName: string | null;
  email: string | null;
  instanceUrl: string | null;
  hasSession: boolean;
  hydrated: boolean;
  roles: string[];

  /** Per-device biometric setting. */
  biometricEnabled: boolean;
  /** Runtime gate — true when the app should show the biometric lock screen. */
  biometricLocked: boolean;

  hydrate: () => Promise<void>;
  login: (email: string, password: string, url: string) => Promise<boolean>;
  /** Prompt the OS biometric, then re-authenticate `url` (default: the live
   *  site) using that site's stored password. */
  biometricLogin: (url?: string) => Promise<
    | { ok: true }
    | { ok: false; reason: 'cancelled' | 'no_credentials' | 'auth_failed' | 'unavailable'; message?: string }
  >;
  setBiometricEnabled: (on: boolean) => Promise<void>;
  unlock: () => void;
  /** Make a signed-in saved site the live one, no password asked. Its saved
   *  session is checked quietly first; the app then starts over on it. */
  switchSite: (url: string) => Promise<
    { ok: true } | { ok: false; reason: 'no_session' | 'expired'; email: string | null }
  >;
  /** Sign out of ONE site (default: the live one). Its session goes; the site
   *  stays in the list and its password backup stays for biometrics. */
  signOutSite: (url?: string) => Promise<void>;
  /** Remove a site from this device: session, password backup and list entry. */
  forgetSite: (url: string) => Promise<void>;
  /** Sign out of the live site only (kept for older callers). */
  logout: () => Promise<void>;
  /** Hard reset: sign out of EVERY site, drop every password backup and the
   *  biometric setting. Callers confirm first (see `confirmForgetDevice`). */
  forgetDevice: () => Promise<void>;
  hasRole: (role: string) => boolean;
};

/** A device signed in before sites kept their own sessions: file the live
 *  session (and its password backup) under its site, once. */
async function adoptLiveSite(): Promise<void> {
  try {
    const [url, cookie] = await Promise.all([
      storage.get(StorageKeys.instanceUrl),
      storage.get(StorageKeys.cookie),
    ]);
    if (!url || !cookie || (await siteSessions.get(url))) return;
    const [email, fullName, roles, pw] = await Promise.all([
      storage.get(StorageKeys.emailBackup),
      storage.get(StorageKeys.fullName),
      authRepository.loadRoles(),
      storage.get(StorageKeys.passwordBackup),
    ]);
    await siteSessions.set(url, { cookie, roles, fullName, email });
    if (pw) {
      await siteSessions.setPassword(url, pw);
      await storage.remove(StorageKeys.passwordBackup);
    }
    if (!(await knownInstances.get(url))) await knownInstances.remember(url, email, fullName);
  } catch {
    // Not fatal: the live keys still work, the site just joins the list at its next sign-in.
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'idle',
  error: null,
  fullName: null,
  email: null,
  instanceUrl: null,
  hasSession: false,
  hydrated: false,
  roles: [],
  biometricEnabled: false,
  biometricLocked: false,

  hydrate: async () => {
    // fullName was never read back here before -- every fresh app launch
    // (not a brand-new login within the same session) left it null in
    // memory, so the home screen's `fullName || email` greeting fell back
    // to the email on every relaunch regardless of what login() had stored.
    await adoptLiveSite();
    const [hasSession, roles, email, fullName, instanceUrl, bioFlag] = await Promise.all([
      authRepository.hasSession(),
      authRepository.loadRoles(),
      storage.get(StorageKeys.emailBackup),
      storage.get(StorageKeys.fullName),
      storage.get(StorageKeys.instanceUrl),
      storage.get(StorageKeys.biometricEnabled),
    ]);
    const justSwitched = await consumeInstanceSwitched(instanceUrl);
    const biometricEnabled = bioFlag === '1';
    // The start right after a sign-in to another server (this one) was signed in a moment ago.
    const biometricLocked =
      hasSession && biometricEnabled && !justSwitched && Biometric.isModuleAvailable();
    set({
      hasSession,
      hydrated: true,
      roles,
      email,
      fullName,
      instanceUrl,
      biometricEnabled,
      biometricLocked,
    });
  },

  login: async (email, password, url) => {
    set({ status: 'loading', error: null });
    const result = await authRepository.login(email, password, url);
    if (result.ok) {
      if (result.switched) {
        // Signed in to a different instance than the one live before: start
        // the app over before anything routes, so no screen mounts against the
        // new server with the previous one's stores. The sign-in report goes
        // first (briefly) so the register sees this login.
        await withTimeout(reportInstall({ reason: 'login', user: email }), LOGIN_REPORT_WAIT_MS);
        if (await restartForInstance(result.instanceUrl)) {
          // The reload tears this JS down; carry on in place only if it never comes.
          await sleep(RELOAD_GRACE_MS);
          // Still here: the restart never came, so its skip-lock flag goes too.
          await storage.remove(StorageKeys.instanceSwitched).catch(() => {});
        }
      } else {
        reportInstall({ reason: 'login', user: email });
      }
      loginDraft.clearIfSite(result.instanceUrl).catch(() => {});
      set({
        status: 'success',
        fullName: result.fullName,
        email,
        instanceUrl: result.instanceUrl,
        hasSession: true,
        roles: result.roles,
        error: null,
        // A fresh password login never lands on the biometric lock screen.
        biometricLocked: false,
      });
      return true;
    }
    set({ status: 'error', error: result.error, hasSession: false });
    return false;
  },

  biometricLogin: async (url) => {
    if (!Biometric.isModuleAvailable()) {
      return { ok: false, reason: 'unavailable' };
    }
    const auth = await Biometric.authenticate({
      promptMessage: 'Sign in to Upande Packhouse',
      fallbackLabel: 'Use password',
      cancelLabel: 'Cancel',
    });
    if (!auth.success) {
      if (auth.error === 'user_cancel' || auth.error === 'system_cancel') {
        return { ok: false, reason: 'cancelled' };
      }
      return { ok: false, reason: 'auth_failed', message: auth.error };
    }
    const target = url ?? get().instanceUrl ?? (await storage.get(StorageKeys.instanceUrlBackup));
    if (!target) return { ok: false, reason: 'no_credentials' };
    const creds = await authRepository.loadFullCredentials(target);
    if (!creds.email || !creds.password || !creds.url) {
      return { ok: false, reason: 'no_credentials' };
    }
    const ok = await get().login(creds.email, creds.password, creds.url);
    if (!ok) {
      return { ok: false, reason: 'auth_failed', message: get().error ?? undefined };
    }
    return { ok: true };
  },

  setBiometricEnabled: async (on) => {
    await storage.set(StorageKeys.biometricEnabled, on ? '1' : '0');
    set({ biometricEnabled: on });
  },

  unlock: () => set({ biometricLocked: false }),

  switchSite: async (url) => {
    const known = await knownInstances.get(url);
    const target = known?.url ?? url;
    const session = await siteSessions.get(target);
    if (!session) return { ok: false, reason: 'no_session', email: known?.email ?? null };
    const check = await verifySession(target, session.cookie);
    if (check.state === 'expired') {
      await siteSessions.clear(target);
      return { ok: false, reason: 'expired', email: session.email ?? known?.email ?? null };
    }
    // Unreachable: enter on the saved session; the screens report the offline state themselves.
    const live =
      check.state === 'valid'
        ? { ...session, roles: check.roles, fullName: check.fullName ?? session.fullName }
        : session;
    if (check.state === 'valid') await siteSessions.set(target, live);
    await activateSite(target, live);
    await knownInstances.touch(target);
    set({
      status: 'idle',
      error: null,
      fullName: live.fullName,
      email: live.email,
      instanceUrl: target,
      hasSession: true,
      roles: live.roles,
      biometricLocked: false,
    });
    // Every store and open request belonged to the previous site: start over on this one.
    await restartForInstance(target);
    return { ok: true };
  },

  signOutSite: async (url) => {
    const target = url ?? get().instanceUrl;
    if (target) await siteSessions.clear(target);
    const live = get().instanceUrl;
    if (!target || (live && instanceKey(live) === instanceKey(target))) {
      // The live site's copy goes too. Its password stays for biometric sign-in,
      // and roles go because the next person to sign in may not hold them.
      await Promise.all([storage.remove(StorageKeys.cookie), storage.remove(StorageKeys.userRoles)]);
      set({ status: 'idle', error: null, hasSession: false, roles: [], biometricLocked: false });
    }
  },

  forgetSite: async (url) => {
    const live = get().instanceUrl;
    const isLive = !!live && instanceKey(live) === instanceKey(url);
    if (isLive) await get().signOutSite(url);
    await siteSessions.wipe(url);
    await knownInstances.forget(url);
    if (isLive) {
      await Promise.all([
        storage.remove(StorageKeys.instanceUrl),
        storage.remove(StorageKeys.instanceUrlBackup),
        storage.remove(StorageKeys.emailBackup),
        storage.remove(StorageKeys.fullName),
      ]);
      set({ fullName: null, email: null, instanceUrl: null });
    }
  },

  logout: async () => {
    await get().signOutSite();
  },

  forgetDevice: async () => {
    const sites = await knownInstances.list();
    await Promise.all(sites.map((site) => siteSessions.wipe(site.url)));
    const live = get().instanceUrl;
    if (live) await siteSessions.wipe(live);
    await authRepository.logout();
    await storage.remove(StorageKeys.biometricEnabled);
    set({
      status: 'idle',
      error: null,
      fullName: null,
      email: null,
      instanceUrl: null,
      hasSession: false,
      roles: [],
      biometricEnabled: false,
      biometricLocked: false,
    });
  },

  hasRole: (role) => get().roles.includes(role) || get().roles.includes('Administrator'),
}));
