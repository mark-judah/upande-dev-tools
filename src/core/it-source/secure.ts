import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/** Secrets (a session cookie) go to the OS keystore on a phone; the web preview has none, so it uses AsyncStorage. */
const useKeystore = Platform.OS !== 'web';

export const secure = {
  get: (key: string): Promise<string | null> => (useKeystore ? SecureStore.getItemAsync(key) : AsyncStorage.getItem(key)),
  set: (key: string, value: string): Promise<void> => (useKeystore ? SecureStore.setItemAsync(key, value) : AsyncStorage.setItem(key, value)),
  remove: (key: string): Promise<void> => (useKeystore ? SecureStore.deleteItemAsync(key) : AsyncStorage.removeItem(key)),
};
