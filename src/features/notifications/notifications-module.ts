import { NativeModules, Platform } from 'react-native';

export type NotificationsModule = typeof import('expo-notifications');

/**
 * True when expo-notifications' native side is in this build. Expo modules register with `expo`'s registry; the
 * other probes cover older registration paths. An OTA bundle on an APK built without the module must never call it.
 */
function hasNativeSide(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- probing only
    const core = require('expo') as { requireOptionalNativeModule?: (name: string) => unknown };
    if (typeof core.requireOptionalNativeModule === 'function' && core.requireOptionalNativeModule('ExpoPushTokenManager')) return true;
  } catch {
    /* next probe */
  }
  try {
    return !!(NativeModules as Record<string, unknown> | undefined)?.ExpoPushTokenManager;
  } catch {
    return false;
  }
}

let cached: NotificationsModule | null | undefined;

/**
 * `expo-notifications`, or null where it cannot work: the web build (previews), or a native build without the module.
 * Everything in src/features/notifications goes through this, so nothing throws at import time on those builds.
 */
export function notificationsModule(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (Platform.OS === 'web' || !hasNativeSide()) {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module, loaded lazily
    cached = require('expo-notifications') as NotificationsModule;
  } catch {
    cached = null;
  }
  return cached;
}
