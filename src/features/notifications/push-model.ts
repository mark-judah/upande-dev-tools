/**
 * Push registration as plain data: why it can fail, the short message each failure shows, how raw errors map onto
 * those reasons, and the retry schedule. No imports, so it runs under `node --test`.
 */

export type PushProblem =
  /** Web preview: there is no push there. */
  | 'web'
  /** An emulator or simulator: Expo push tokens need a real phone. */
  | 'not-device'
  /** This build has no expo-notifications native module. */
  | 'no-module'
  /** This build has no Expo project id (`expo.extra.eas.projectId`). */
  | 'no-project-id'
  /** Android build without Firebase (`android.googleServicesFile`), so FCM cannot hand out a token. */
  | 'no-firebase'
  /** The person has not allowed notifications yet (we may still ask). */
  | 'permission-needed'
  /** Notifications are blocked in the phone's settings (asking again shows nothing). */
  | 'blocked'
  /** No network, or the server could not be reached: retried automatically. */
  | 'offline'
  /** The server refused the token (it answered, with an error). */
  | 'server'
  | 'unknown';

export type PushCheck = { ok: true; token: string } | { ok: false; problem: PushProblem; message: string };

/** Problems no retry can fix: the build itself has to change. */
export const BUILD_PROBLEMS: readonly PushProblem[] = ['web', 'not-device', 'no-module', 'no-project-id', 'no-firebase'];

export function isBuildProblem(p: PushProblem): boolean {
  return BUILD_PROBLEMS.includes(p);
}

/** Whether trying again later may succeed on its own (network or server hiccup). */
export function isRetryable(p: PushProblem): boolean {
  return p === 'offline' || p === 'server' || p === 'unknown';
}

/** One short sentence per failure. The raw error is never shown. */
export function pushMessage(p: PushProblem): string {
  switch (p) {
    case 'web':
      return 'Push notifications work in the phone app, not in the web preview.';
    case 'not-device':
      return 'Push notifications need a real phone, not an emulator.';
    case 'no-module':
      return 'This version of the app cannot receive push notifications. Install the latest build.';
    case 'no-project-id':
    case 'no-firebase':
      return 'Push is not set up in this build yet (no Firebase / Expo project configured). Your inbox still collects every notification.';
    case 'permission-needed':
      return 'Allow notifications to get alerts on this phone.';
    case 'blocked':
      return "Notifications are blocked for this app. Turn them on in the phone's settings.";
    case 'offline':
      return 'Could not reach the server. It will try again when you are back online.';
    case 'server':
      return 'The server could not save this phone for notifications. It will try again shortly.';
    default:
      return 'Could not turn notifications on. It will try again shortly.';
  }
}

export function fail(problem: PushProblem): PushCheck {
  return { ok: false, problem, message: pushMessage(problem) };
}

/**
 * Maps an error thrown by `getExpoPushTokenAsync` (or the register call) to a reason. Firebase-missing on Android
 * surfaces as "Default FirebaseApp is not initialized..." or a FCM/google-services message; a missing project id as
 * "No projectId found" / experienceId; network trouble as fetch/timeout errors.
 */
export function classifyPushError(e: unknown): PushProblem {
  const msg = (e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e ?? '')).toLowerCase();
  const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: unknown }).code).toLowerCase() : '';
  if (/firebase|fcm|google-services|googleservices|missing_instanceid|service_not_available/.test(msg + code)) return 'no-firebase';
  if (/projectid|project id|experienceid|no "projectid"/.test(msg)) return 'no-project-id';
  if (/network|timeout|timed out|offline|failed to fetch|internet|econn|enotfound|unreachable/.test(msg + code)) return 'offline';
  return 'unknown';
}

/** Exponential backoff with jitter: 2s, 4s, 8s... capped (default 5 min). `rand` is injectable for tests. */
export function backoffDelay(attempt: number, opts: { base?: number; max?: number; rand?: () => number } = {}): number {
  const base = opts.base ?? 2000;
  const max = opts.max ?? 5 * 60 * 1000;
  const rand = opts.rand ?? Math.random;
  const exp = Math.min(max, base * 2 ** Math.max(0, attempt));
  // Full jitter on the top half: spreads retries from many phones without ever waiting less than half the step.
  return Math.round(exp / 2 + rand() * (exp / 2));
}

/** A registration is worth repeating when anything that identifies it changed, or it is older than `maxAgeMs`. */
export function needsRegistration(
  last: { token: string; owner: string; at: number } | null,
  current: { token: string; owner: string },
  now: number,
  maxAgeMs = 12 * 60 * 60 * 1000,
): boolean {
  if (!last) return true;
  return last.token !== current.token || last.owner !== current.owner || now - last.at > maxAgeMs;
}
