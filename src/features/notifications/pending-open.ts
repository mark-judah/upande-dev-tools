import { create } from 'zustand';

/**
 * A tapped notification waiting for the app to be ready (signed in, unlocked, past the login/lock screens). A tap
 * that cold-starts the app, or arrives while the biometric lock is up, is parked here instead of being dropped, and
 * `NotificationsHost` opens it as soon as it can. Only the latest tap is kept.
 */
export type PendingOpen = { route: string; name: string | null };

type State = {
  pending: PendingOpen | null;
  queue: (p: PendingOpen) => void;
  take: () => PendingOpen | null;
  clear: () => void;
};

export const usePendingOpen = create<State>((set, get) => ({
  pending: null,
  queue: (p) => set({ pending: p }),
  take: () => {
    const p = get().pending;
    if (p) set({ pending: null });
    return p;
  },
  clear: () => set({ pending: null }),
}));

/** The Mobile Notification row a push refers to, when the server put it in the payload. */
export function notificationName(data: Record<string, unknown> | null | undefined): string | null {
  if (!data) return null;
  for (const k of ['notification', 'notification_name', 'mobile_notification', 'name']) {
    const v = data[k];
    if (typeof v === 'string' && v.trim() && v.length <= 140) return v.trim();
  }
  return null;
}

/** A push payload's `data` as a plain object, whatever arrived (missing, a JSON string, an array...). */
export function payloadData(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw) as unknown;
      return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}
