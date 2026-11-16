import AsyncStorage from '@react-native-async-storage/async-storage';
import { secureStorage } from '@/core/auth/secure-storage';

export const StorageKeys = {
  cookie: 'cookie',
  instanceUrl: 'instanceurl',
  instanceUrlBackup: 'instanceurl_backup',
  emailBackup: 'email_backup',
  fullName: 'fullname',
  userStation: 'userStation',
  versionLastReportedOn: 'versionLastReportedOn',
  userRoles: 'userRoles',
  biometricEnabled: 'biometric_enabled',
  // Password is saved on every successful password login so the biometric
  // flow can re-authenticate by feeding it back to the same login endpoint.
  // Stored in AsyncStorage (not encrypted); access is gated by the OS
  // biometric prompt. On a rooted device this is readable — accept that
  // trade-off or migrate to expo-secure-store with a native rebuild.
  passwordBackup: 'password_backup',
  boxLabelsHistory: 'box_labels_history',
  // Instances this device has signed in to, newest first, for the login
  // screen's picker. Survives sign-out and "Forget this device".
  knownInstances: 'known_instances',
  // Last GitHub Releases check for a newer APK (see src/core/updates).
  apkUpdateCheck: 'apk_update_check',
  /** Dispatch: the location last picked (Loading Plan > Location, e.g. Ravine / Karen). */
  dispatchLocation: 'dispatch_location',
  /** Dispatch: seal numbers typed per truck and delivery date (the last week's). */
  dispatchSeals: 'dispatch_seals',
  // The server (instanceKey) a switched sign-in landed on, for the relaunch
  // that follows: the biometric lock is skipped once, on that server only.
  instanceSwitched: 'instance_switched',
  /** Captures made offline, waiting to be sent. */
  captureQueue: 'capture_queue',
  /** Last known gamification totals, shown before the server answers. */
  achievementsCache: 'achievements_cache',
  /** What was typed on the add-a-site form (url + email), kept until a sign-in succeeds. */
  loginDraft: 'login_draft',
} as const;

/** Keys whose values are secrets: kept in the OS keystore, not plain AsyncStorage. */
const SECRET_KEYS: readonly string[] = [StorageKeys.cookie, StorageKeys.passwordBackup];

async function getSecret(key: string): Promise<string | null> {
  const v = await secureStorage.get(key);
  if (v != null) return v;
  // Written by an older build into plain storage: move it into the keystore once.
  const legacy = await AsyncStorage.getItem(key);
  if (legacy != null) {
    await secureStorage.set(key, legacy);
    await AsyncStorage.removeItem(key);
  }
  return legacy;
}

export const storage = {
  get: (key: string): Promise<string | null> =>
    SECRET_KEYS.includes(key) ? getSecret(key) : AsyncStorage.getItem(key),
  async set(key: string, value: string): Promise<void> {
    if (SECRET_KEYS.includes(key)) {
      await secureStorage.set(key, value);
      await AsyncStorage.removeItem(key);
      return;
    }
    await AsyncStorage.setItem(key, value);
  },
  async remove(key: string): Promise<void> {
    if (SECRET_KEYS.includes(key)) await secureStorage.remove(key);
    await AsyncStorage.removeItem(key);
  },
  async clearExcept(keep: string[]): Promise<void> {
    const allKeys = Object.values(StorageKeys);
    await Promise.all(
      allKeys
        .filter((k) => !keep.includes(k))
        .map((k) => storage.remove(k)),
    );
  },
};
