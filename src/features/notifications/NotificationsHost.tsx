import { useEffect } from 'react';
import { AppState } from 'react-native';
import { router, useSegments } from 'expo-router';
import { useAuthStore } from '@/core/auth/store';
import { useToast } from '@/core/ui/Toast';
import { hasDevAccess } from '@/navigation';
import { notificationsModule, type NotificationsModule } from './notifications-module';
import { shouldShow, useNotificationStore } from './notification-store';
import { startPushLifecycle } from './push';
import { useInbox } from './inbox-store';
import { safeRoute } from './safe-route';
import { notificationName, payloadData, usePendingOpen } from './pending-open';

export { safeRoute } from './safe-route';

const PUBLIC_ROUTES = ['login', 'biometric-lock', 'no-access'];
type Response = Parameters<Parameters<NotificationsModule['addNotificationResponseReceivedListener']>[0]>[0];
type Notification = Parameters<Parameters<NotificationsModule['addNotificationReceivedListener']>[0]>[0];

const N = notificationsModule();

// OS banners are suppressed while the app is open: foreground alerts show as toasts instead. The on-phone test
// notification from Settings is the exception, since its whole point is to show the system banner.
try {
  N?.setNotificationHandler({
    handleNotification: async (n: Notification) => {
      const test = payloadData(n?.request?.content?.data)?.local_test === true;
      return { shouldShowBanner: test, shouldShowList: test, shouldPlaySound: test, shouldSetBadge: false };
    },
  });
} catch {
  // No handler: the OS default (nothing shown in the foreground) applies.
}

/** Responses already handled, so the launch tap seen by both the listener and the "last response" is opened once. */
const handled = new Set<string>();

function onTap(res: Response | null | undefined) {
  if (!res || !N || res.actionIdentifier !== N.DEFAULT_ACTION_IDENTIFIER) return;
  const id = `${res.notification?.request?.identifier ?? ''}:${res.notification?.date ?? ''}`;
  if (handled.has(id)) return;
  handled.add(id);
  const data = payloadData(res.notification?.request?.content?.data);
  if (!data || data.local_test === true) return;
  // Support replies belong to the kit's chat (it opens them itself).
  if (data.upande_mobile === 'support') return;
  const name = notificationName(data);
  const route = safeRoute(data.route);
  // A notification with no route we may open still lands somewhere useful: the inbox that holds it.
  if (!route && !name) return;
  usePendingOpen.getState().queue({ route: route ?? '/notifications', name });
}

function ownerOf(hasSession: boolean, url: string | null, email: string | null): string | null {
  return hasSession && url && email ? `${url.toLowerCase()}|${email.toLowerCase()}` : null;
}

/**
 * Root-mounted. Wires notifications into the app:
 * - push: registers the token (after the person turned push on) and keeps it current (`startPushLifecycle`);
 * - inbox: syncs on sign-in, foreground and every received push; cleared on sign-out;
 * - taps: a tapped notification (also the one that cold-started the app) is queued and opened once the person is
 *   signed in, unlocked and past the login/lock screens, then marked read;
 * - foreground pushes show as a toast.
 */
export function NotificationsHost() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const hasSession = useAuthStore((s) => s.hasSession);
  const locked = useAuthStore((s) => s.biometricLocked);
  const roles = useAuthStore((s) => s.roles);
  const instanceUrl = useAuthStore((s) => s.instanceUrl);
  const email = useAuthStore((s) => s.email);
  const enabled = useNotificationStore((s) => s.enabled);
  const hydratePrefs = useNotificationStore((s) => s.hydrate);
  const pending = usePendingOpen((s) => s.pending);
  const segments = useSegments();
  const toast = useToast();

  const first = segments[0] as string | undefined;
  const owner = ownerOf(hasSession, instanceUrl, email);
  const unlocked = hydrated && !!owner && !locked;
  const ready = unlocked && hasDevAccess(roles ?? []) && !!first && !PUBLIC_ROUTES.includes(first);

  useEffect(() => {
    void hydratePrefs();
  }, [hydratePrefs]);

  // Listeners live for the whole app, so a tap is never missed while signed out or locked (it is queued).
  useEffect(() => {
    if (!N) return;
    const subs: { remove: () => void }[] = [];
    try {
      subs.push(N.addNotificationResponseReceivedListener(onTap));
      subs.push(
        N.addNotificationReceivedListener((n) => {
          const c = n?.request?.content;
          const data = payloadData(c?.data);
          if (data?.local_test === true) return;
          // The inbox is the source of truth: a push only says "there is something new".
          if (useInbox.getState().owner) void useInbox.getState().sync();
          const kind = typeof data?.kind === 'string' ? data.kind : undefined;
          const text = [c?.title, c?.body].filter((x) => typeof x === 'string' && x).join(': ');
          if (!text || !shouldShow(kind)) return;
          const route = safeRoute(data?.route);
          const name = notificationName(data);
          toast.showInfo(text, route ? { action: { label: 'Open', onPress: () => usePendingOpen.getState().queue({ route, name }) } } : undefined);
        }),
      );
    } catch {
      // Without listeners, notifications still arrive in the tray and in the inbox.
    }
    // The tap that launched the app. Cleared after reading, so the next launch does not open it again.
    (async () => {
      try {
        const last = await N.getLastNotificationResponseAsync();
        onTap(last);
        if (last) await N.clearLastNotificationResponseAsync();
      } catch {
        // Older native side: nothing to recover.
      }
    })();
    return () => subs.forEach((s) => s.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The inbox follows whoever is signed in: their cache at once, then the server. Signing out clears it.
  useEffect(() => {
    if (!hydrated) return;
    if (!owner) {
      void useInbox.getState().clear();
      usePendingOpen.getState().clear();
      return;
    }
    if (locked) return;
    let live = true;
    void useInbox
      .getState()
      .activate(owner)
      .then(() => {
        if (live) void useInbox.getState().sync();
      });
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') void useInbox.getState().sync();
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, [hydrated, owner, locked]);

  // Push: only after the person turned it on, and only while signed in and unlocked.
  useEffect(() => {
    if (!unlocked || !enabled) return;
    return startPushLifecycle();
  }, [unlocked, enabled, owner]);

  // Open the queued tap once the app can show it.
  useEffect(() => {
    if (!ready || !pending) return;
    const p = usePendingOpen.getState().take();
    if (!p) return;
    if (p.name) useInbox.getState().markRead([p.name]);
    // Next tick: lets the auth gate finish its own navigation first. (No cleanup: taking the tap re-runs this
    // effect, and cancelling here would drop the navigation.)
    setTimeout(() => router.push(p.route as never), 0);
  }, [ready, pending]);

  return null;
}
