import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useAuthStore } from '@/core/auth/store';
import { useToast } from '@/core/ui/Toast';
import { shouldShow, useNotificationStore } from './notification-store';
import { registerPush } from './push';

const ALLOWED = ['/task/', '/request/', '/deployments', '/backlog'];

/** Only in-app paths we know; anything else in a payload is ignored. */
export function safeRoute(route: unknown): string | null {
  if (typeof route !== 'string' || !route.startsWith('/') || route.startsWith('//') || route.includes('..')) return null;
  if (route === '/') return route;
  return ALLOWED.some((p) => route === p || route.startsWith(p.endsWith('/') ? p : `${p}/`) || route.startsWith(`${p}?`)) ? route : null;
}

// OS banners are suppressed; foreground alerts are shown as toasts instead.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function open(response: Notifications.NotificationResponse | null) {
  if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
  const route = safeRoute(response.notification.request.content.data?.route);
  if (route) router.push(route as never);
}

/** Root-mounted: registers the push token after opt-in and handles incoming/tapped notifications. */
export function NotificationsHost() {
  const hasSession = useAuthStore((s) => s.hasSession);
  const locked = useAuthStore((s) => s.biometricLocked);
  const enabled = useNotificationStore((s) => s.enabled);
  const hydrate = useNotificationStore((s) => s.hydrate);
  const toast = useToast();
  // Push is native only: the web build (used for previews) has no notification module.
  const ready = hasSession && !locked && Platform.OS !== 'web';

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Register (never prompts; permission is requested from the settings screen).
  useEffect(() => {
    if (!ready || !enabled) return;
    const run = () => {
      registerPush().catch((e) => console.warn('push registration:', e instanceof Error ? e.message : e));
    };
    run();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && run());
    return () => sub.remove();
  }, [ready, enabled]);

  useEffect(() => {
    if (!ready) return;
    // Cold start: the notification that launched the app.
    open(Notifications.getLastNotificationResponse());
    const tap = Notifications.addNotificationResponseReceivedListener(open);
    const recv = Notifications.addNotificationReceivedListener((n) => {
      const c = n.request.content;
      const kind = c.data?.kind;
      if (!shouldShow(typeof kind === 'string' ? kind : undefined)) return;
      toast.showInfo([c.title, c.body].filter(Boolean).join(': '));
    });
    return () => {
      tap.remove();
      recv.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return null;
}
