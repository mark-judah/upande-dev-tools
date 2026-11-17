import { AppState, Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { isAxiosError } from 'axios';
import { getInstallId } from '@upande/mobile-kit';
import { api } from '@/core/api/client';
import { useAuthStore } from '@/core/auth/store';
import { onBeforeSignOut } from '@/core/auth/session-hooks';
import { notificationsModule } from './notifications-module';
import { useNotificationStore } from './notification-store';
import { backoffDelay, classifyPushError, fail, isRetryable, needsRegistration, pushMessage, type PushCheck, type PushProblem } from './push-model';

/**
 * Push registration, in one place:
 * 1. `checkPush` checks every prerequisite (module, real device, Expo project id, Android channels, permission,
 *    Firebase) and returns a typed result with a short message. It never throws.
 * 2. `syncPush` registers the token with the server (`register_push`), retrying with backoff while offline, and is
 *    called on sign-in, on foreground and when the OS rotates the token. Calls coalesce into one run.
 * 3. Before sign-out the token is unregistered while the session still works (see `onBeforeSignOut`).
 */

const APP_NAME = 'Upande Dev Tools';
const REGISTER = '/api/method/upande_mobile.api.support.register_push';
const UNREGISTER = '/api/method/upande_mobile.api.support.unregister_push';
const MAX_ATTEMPTS = 8;
const TOKEN_TIMEOUT_MS = 20000;

/** Android channel ids the server sends on (upande_dev_tools/api/notifications.py and upande_mobile.push). */
const CHANNELS: { id: string; name: string; high: boolean }[] = [
  { id: 'default', name: 'General', high: true },
  { id: 'tasks', name: 'Tasks', high: true },
  { id: 'reminders', name: 'Reminders', high: true },
  { id: 'events', name: 'Updates', high: false },
  { id: 'deployments', name: 'Deployments', high: true },
  { id: 'support', name: 'Support', high: true },
];

function timeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what} timed out`)), ms))]);
}

let channelsReady: Promise<void> | null = null;

/** Creates the Android channels once per launch (Android 13+ only shows the permission prompt once one exists). */
export function ensureChannels(): Promise<void> {
  const N = notificationsModule();
  if (!N || Platform.OS !== 'android') return Promise.resolve();
  if (!channelsReady) {
    channelsReady = Promise.all(
      CHANNELS.map((c) =>
        N.setNotificationChannelAsync(c.id, {
          name: c.name,
          importance: c.high ? N.AndroidImportance.HIGH : N.AndroidImportance.DEFAULT,
          sound: 'default',
        }),
      ),
    )
      .then(() => undefined)
      .catch(() => {
        channelsReady = null; // try again next time
      });
  }
  return channelsReady;
}

export function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

/** Whether the build's config names a google-services file (only a hint: used to explain an unknown token error). */
function firebaseConfigured(): boolean {
  if (Platform.OS !== 'android') return true;
  const android = Constants.expoConfig?.android as { googleServicesFile?: string } | undefined;
  return !!android?.googleServicesFile;
}

/** Prerequisites that do not involve the person: can this build receive push at all? */
export function buildProblem(): PushProblem | null {
  if (Platform.OS === 'web') return 'web';
  if (!notificationsModule()) return 'no-module';
  if (!Device.isDevice) return 'not-device';
  if (!projectId()) return 'no-project-id';
  return null;
}

/** Permission state: granted, may ask, or blocked in system settings. Never prompts. */
export async function permissionState(): Promise<'granted' | 'ask' | 'blocked' | 'unknown'> {
  const N = notificationsModule();
  if (!N) return 'unknown';
  try {
    const p = await N.getPermissionsAsync();
    if (p.granted) return 'granted';
    return p.canAskAgain === false ? 'blocked' : 'ask';
  } catch {
    return 'unknown';
  }
}

/**
 * Checks every prerequisite and returns the Expo push token, or the first problem with its message. Asks for
 * permission only when `ask` is true (the person's own tap), so a launch-time sync never pops a dialog. Never throws.
 */
export async function checkPush({ ask }: { ask: boolean }): Promise<PushCheck> {
  const build = buildProblem();
  if (build) return fail(build);
  const N = notificationsModule()!;
  try {
    await ensureChannels();
    let perm = await N.getPermissionsAsync();
    if (!perm.granted && ask && perm.canAskAgain !== false) perm = await N.requestPermissionsAsync();
    if (!perm.granted) return fail(perm.canAskAgain === false ? 'blocked' : 'permission-needed');
  } catch {
    return fail('unknown');
  }
  try {
    const { data } = await timeout(N.getExpoPushTokenAsync({ projectId: projectId()! }), TOKEN_TIMEOUT_MS, 'push token');
    if (typeof data !== 'string' || !data) return fail('unknown');
    return { ok: true, token: data };
  } catch (e) {
    const p = classifyPushError(e);
    return fail(p === 'unknown' && !firebaseConfigured() ? 'no-firebase' : p);
  }
}

function ownerKey(): string | null {
  const { hasSession, instanceUrl, email } = useAuthStore.getState();
  return hasSession && instanceUrl && email ? `${instanceUrl.toLowerCase()}|${email.toLowerCase()}` : null;
}

async function sendToken(token: string): Promise<PushProblem | null> {
  try {
    const installId = await getInstallId().catch(() => null);
    await api({ method: 'POST', url: REGISTER, data: { app: APP_NAME, token, platform: Platform.OS, install_id: installId ?? '' } });
    return null;
  } catch (e) {
    return isAxiosError(e) && e.response ? 'server' : 'offline';
  }
}

// One run at a time. A call made during a run asks for one more pass afterwards instead of starting another.
let running: Promise<PushCheck> | null = null;
let again: { force: boolean } | null = null;
let attempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
/** Bumped on sign-out / turn-off so a retry scheduled for the old session never fires into the new one. */
let generation = 0;

function cancelRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

function scheduleRetry(gen: number) {
  cancelRetry();
  if (attempt >= MAX_ATTEMPTS) {
    useNotificationStore.getState().setPhase('failed', useNotificationStore.getState().problem, useNotificationStore.getState().message);
    return;
  }
  const wait = backoffDelay(attempt);
  attempt += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (gen === generation) void syncPush();
  }, wait);
}

async function runOnce(force: boolean): Promise<PushCheck> {
  const store = useNotificationStore.getState();
  const gen = generation;
  const owner = ownerKey();
  if (!owner) return fail('unknown');
  store.setPhase('working');
  const check = await checkPush({ ask: false });
  if (gen !== generation) return check;
  if (!check.ok) {
    if (isRetryable(check.problem)) {
      store.setPhase('retrying', check.problem, check.message);
      scheduleRetry(gen);
    } else {
      store.setPhase('failed', check.problem, check.message);
    }
    return check;
  }
  const now = Date.now();
  if (!force && !needsRegistration(store.registration, { token: check.token, owner }, now)) {
    attempt = 0;
    store.setPhase('registered');
    return check;
  }
  const problem = await sendToken(check.token);
  if (gen !== generation) return check;
  if (problem) {
    store.setPhase('retrying', problem, pushMessage(problem));
    scheduleRetry(gen);
    return fail(problem);
  }
  attempt = 0;
  cancelRetry();
  store.setRegistration({ token: check.token, owner, at: Date.now() });
  store.setPhase('registered');
  return check;
}

/**
 * Keeps the server's copy of this phone's token current for whoever is signed in, when push is on. Safe to call
 * often (sign-in, foreground, token rotation): calls coalesce, and an unchanged registration is not re-sent unless
 * `force` is set or it is older than 12 hours.
 */
export async function syncPush(opts: { force?: boolean } = {}): Promise<PushCheck> {
  const store = useNotificationStore.getState();
  await store.hydrate();
  if (!useNotificationStore.getState().enabled || !ownerKey()) return fail('unknown');
  if (running) {
    again = { force: !!opts.force || !!again?.force };
    return running;
  }
  running = (async () => {
    try {
      let res = await runOnce(!!opts.force);
      while (again) {
        const next = again;
        again = null;
        res = await runOnce(next.force);
      }
      return res;
    } finally {
      running = null;
    }
  })();
  return running;
}

/**
 * The person's "Turn on": asks for permission (when it may still be asked), gets the token and registers it.
 * Push stays on when only the network failed (it retries by itself); a build problem or a refusal leaves it off.
 */
export async function turnOnPush(): Promise<PushCheck> {
  const store = useNotificationStore.getState();
  await store.hydrate();
  const check = await checkPush({ ask: true });
  if (!check.ok) {
    store.setPhase(isRetryable(check.problem) ? 'retrying' : 'failed', check.problem, check.message);
    if (!isRetryable(check.problem)) return check;
  }
  store.setEnabled(true);
  generation += 1;
  attempt = 0;
  return syncPush({ force: true });
}

async function unregister(): Promise<void> {
  const store = useNotificationStore.getState();
  await store.hydrate();
  const reg = useNotificationStore.getState().registration;
  generation += 1;
  cancelRetry();
  attempt = 0;
  store.setRegistration(null);
  store.setPhase('idle');
  if (!reg) return;
  try {
    await timeout(api({ method: 'POST', url: UNREGISTER, data: { token: reg.token } }), 3000, 'unregister');
  } catch {
    // The server drops dead tokens itself (Expo receipts), and the next sign-in re-registers.
  }
}

/** The person's "Turn off": forget the token on the server and the choice on the phone. */
export async function turnOffPush(): Promise<void> {
  useNotificationStore.getState().setEnabled(false);
  await unregister();
}

/**
 * A notification raised on this phone only, to prove channel, permission and display work. It does not test the
 * server or Firebase. Returns a problem message, or null when it was scheduled.
 */
export async function sendTestNotification(): Promise<string | null> {
  const N = notificationsModule();
  if (!N) return pushMessage(Platform.OS === 'web' ? 'web' : 'no-module');
  const perm = await permissionState();
  if (perm !== 'granted') return pushMessage(perm === 'blocked' ? 'blocked' : 'permission-needed');
  try {
    await ensureChannels();
    await N.scheduleNotificationAsync({
      content: { title: 'Test notification', body: 'Notifications show on this phone.', data: { local_test: true } },
      // Immediately, on the General channel (Android); iOS ignores the channel.
      trigger: Platform.OS === 'android' ? { channelId: 'default' } : null,
    });
    return null;
  } catch {
    return 'Could not show a test notification on this phone.';
  }
}

// Unregister while the session still works: the signed-out person must stop getting this phone's alerts.
// The on/off choice stays, so the next sign-in registers again for whoever signs in.
onBeforeSignOut(() => unregister());

/**
 * Starts the token-rotation and foreground listeners. Returns a cleanup. Call once the person is signed in and
 * unlocked.
 */
export function startPushLifecycle(): () => void {
  const N = notificationsModule();
  const subs: { remove: () => void }[] = [];
  void syncPush();
  if (N) {
    try {
      // The OS handed out a new device token: fetch the matching Expo token and register it.
      subs.push(N.addPushTokenListener(() => void syncPush({ force: true })));
    } catch {
      // Without the listener the foreground sync below still catches a rotated token.
    }
  }
  subs.push(AppState.addEventListener('change', (st) => st === 'active' && void syncPush()));
  return () => {
    subs.forEach((s) => s.remove());
    cancelRetry();
  };
}
