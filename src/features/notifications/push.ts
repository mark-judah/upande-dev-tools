import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { api } from '@/core/api/client';
import { useNotificationStore } from './notification-store';

const APP_NAME = 'Upande Dev Tools';
const BASE = '/api/method/upande_mobile.api.support';

export async function ensureChannels() {
  /* eslint-disable import/namespace */
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('tasks', {
    name: 'Tasks',
    importance: Notifications.AndroidImportance.HIGH,
  });
  // Channel ids the backend sends on (upande_dev_tools/api/notifications.py `_channel`).
  await Notifications.setNotificationChannelAsync('reminders', {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.HIGH,
  });
  await Notifications.setNotificationChannelAsync('events', {
    name: 'Updates',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  await Notifications.setNotificationChannelAsync('support', {
    name: 'Support',
    importance: Notifications.AndroidImportance.HIGH,
  });
  /* eslint-enable import/namespace */
}

/** Asks the OS for permission (call only from the user's opt-in). Returns whether it was granted. */
export async function requestPermission(): Promise<boolean> {
  await ensureChannels(); // Android 13+ shows the prompt only once a channel exists
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  const res = await Notifications.requestPermissionsAsync();
  return res.granted;
}

/** Gets the Expo token and registers it. Throws an Error with a user-readable message. Never prompts. */
export async function registerPush(): Promise<string> {
  if (!Device.isDevice) throw new Error('Push notifications need a physical device.');
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) throw new Error('Notifications are blocked. Allow them in system settings.');
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId
    ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('Push is not configured for this build (no EAS project id).');
  await ensureChannels();
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api({
    method: 'POST',
    url: `${BASE}.register_push`,
    data: { app: APP_NAME, token, platform: Platform.OS },
  });
  useNotificationStore.getState().setToken(token);
  return token;
}

export async function unregisterPush(): Promise<void> {
  const token = useNotificationStore.getState().token;
  if (!token) return;
  await api({ method: 'POST', url: `${BASE}.unregister_push`, data: { token } });
  useNotificationStore.getState().setToken(null);
}
