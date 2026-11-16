import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Secrets (session cookies, the biometric password backup) live in the OS
 * keystore on native (`expo-secure-store`). The web has no keystore, so there
 * they sit in AsyncStorage under a `secure.` prefix: no worse than before, and
 * the same call shape.
 *
 * SecureStore keys may only hold letters, digits, `.`, `-` and `_`, so every
 * key goes through `safeKey`.
 */

const WEB_PREFIX = 'secure.';
const isNative = Platform.OS !== 'web';

type SecureStoreModule = typeof import('expo-secure-store');
let mod: SecureStoreModule | null | undefined;

function native(): SecureStoreModule | null {
  if (!isNative) return null;
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-secure-store') as SecureStoreModule;
  } catch {
    mod = null;
  }
  return mod;
}

/** Any string as a valid SecureStore key (injective: odd characters become `_xx`). */
export function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9.\-]/g, (c) => `_${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
}

export const secureStorage = {
  async get(key: string): Promise<string | null> {
    const m = native();
    if (m) {
      try {
        return await m.getItemAsync(safeKey(key));
      } catch {
        return null;
      }
    }
    return AsyncStorage.getItem(WEB_PREFIX + key);
  },
  async set(key: string, value: string): Promise<void> {
    const m = native();
    if (m) {
      try {
        await m.setItemAsync(safeKey(key), value);
        return;
      } catch {
        // Keystore refused (rare, e.g. device locked at boot): keep going with plain storage.
      }
    }
    await AsyncStorage.setItem(WEB_PREFIX + key, value);
  },
  async remove(key: string): Promise<void> {
    const m = native();
    if (m) await m.deleteItemAsync(safeKey(key)).catch(() => {});
    await AsyncStorage.removeItem(WEB_PREFIX + key).catch(() => {});
  },
};
