import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { isAxiosError } from 'axios';
import { mapAxiosError } from '@/core/api/client';
import { InboxUnavailable, listNotifications, markRead as postMarkRead } from './inbox-api';
import { applyRead, coalesce, mergeInbox, nextCursor, unreadBadge, type InboxItem } from './inbox-model';
import { backoffDelay } from './push-model';

/**
 * The per-person notification inbox: the server's outbox (`Mobile Notification`) mirrored on the phone, so a push
 * that was lost, blocked or late never loses the message. Synced on sign-in, on foreground, when a push arrives and
 * on pull-to-refresh; cached for offline; deduped by `name`; read marks are optimistic and retried until the server
 * confirms them. Belongs to one person on one site (`owner`): signing out or switching site clears it.
 */

const CACHE_KEY = 'inbox_cache_v1';
/** A full refresh (from the top) at least this often, to pick up read marks made on other devices. */
const FULL_EVERY_MS = 10 * 60 * 1000;
const MAX_RETRIES = 6;

type Cache = {
  owner: string;
  items: InboxItem[];
  serverUnread: number | null;
  cursor: string | null;
  pendingRead: string[];
  pendingAll: boolean;
  skewMs: number;
};

type State = {
  owner: string | null;
  items: InboxItem[];
  /** The badge number. */
  unread: number;
  serverUnread: number | null;
  cursor: string | null;
  /** Read on this phone, not yet confirmed by the server. */
  pendingRead: string[];
  pendingAll: boolean;
  /** server clock minus phone clock, from the last answer: ages are shown on the server's clock. */
  skewMs: number;
  syncing: boolean;
  lastSyncAt: number | null;
  lastFullAt: number | null;
  /** Short message when the last sync failed (the cached inbox still shows). */
  error: string | null;
  /** False when the server does not have the inbox endpoints yet. */
  available: boolean;
  /** Point the inbox at the signed-in person (`site|email`); loads their cache, drops anyone else's. */
  activate: (owner: string) => Promise<void>;
  /** Fetch new items (`full` refetches from the top). Concurrent calls coalesce into one extra run. */
  sync: (opts?: { full?: boolean }) => Promise<void>;
  markRead: (names: string[]) => void;
  markAllRead: () => void;
  /** Sign-out: forget everything, memory and cache. */
  clear: () => Promise<void>;
};

const initial = {
  owner: null,
  items: [] as InboxItem[],
  unread: 0,
  serverUnread: null,
  cursor: null,
  pendingRead: [] as string[],
  pendingAll: false,
  skewMs: 0,
  syncing: false,
  lastSyncAt: null,
  lastFullAt: null,
  error: null,
  available: true,
};

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retries = 0;
/** Bumped by activate/clear: a sync that started for someone else drops its answer. */
let generation = 0;

function cancelRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

async function saveCache(s: State): Promise<void> {
  if (!s.owner) return;
  const c: Cache = {
    owner: s.owner,
    items: s.items,
    serverUnread: s.serverUnread,
    cursor: s.cursor,
    pendingRead: s.pendingRead,
    pendingAll: s.pendingAll,
    skewMs: s.skewMs,
  };
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(c)).catch(() => {});
}

async function loadCache(owner: string): Promise<Cache | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<Cache>;
    if (!c || c.owner !== owner || !Array.isArray(c.items)) return null;
    return {
      owner,
      items: c.items.filter((i): i is InboxItem => !!i && typeof i.name === 'string' && typeof i.createdMs === 'number'),
      serverUnread: typeof c.serverUnread === 'number' ? c.serverUnread : null,
      cursor: typeof c.cursor === 'string' ? c.cursor : null,
      pendingRead: Array.isArray(c.pendingRead) ? c.pendingRead.filter((n) => typeof n === 'string') : [],
      pendingAll: !!c.pendingAll,
      skewMs: typeof c.skewMs === 'number' ? c.skewMs : 0,
    };
  } catch {
    return null;
  }
}

export const useInbox = create<State>((set, get) => {
  const badge = (items: InboxItem[], serverUnread: number | null, pendingRead: string[], pendingAll: boolean) =>
    pendingAll ? 0 : unreadBadge(serverUnread, items, pendingRead.length);

  /** Sends read marks the server has not confirmed yet. Keeps them pending on failure. */
  async function flushPending(gen: number): Promise<void> {
    const { pendingAll, pendingRead } = get();
    if (!pendingAll && !pendingRead.length) return;
    const names = pendingAll ? ('all' as const) : [...pendingRead];
    await postMarkRead(names);
    if (gen !== generation) return;
    set((s) => ({
      pendingAll: names === 'all' ? false : s.pendingAll,
      pendingRead: names === 'all' ? [] : s.pendingRead.filter((n) => !names.includes(n)),
    }));
  }

  const runSync = async (full: boolean): Promise<void> => {
    const gen = generation;
    const owner = get().owner;
    if (!owner) return;
    const st = get();
    const doFull = full || !st.cursor || !st.lastFullAt || Date.now() - st.lastFullAt > FULL_EVERY_MS;
    set({ syncing: true });
    try {
      // Read marks first, so the list that follows already reflects them.
      await flushPending(gen).catch((e) => {
        if (e instanceof InboxUnavailable) throw e;
      });
      if (gen !== generation) return;
      const res = await listNotifications(doFull ? null : get().cursor);
      if (gen !== generation) return;
      const s = get();
      const items = mergeInbox(s.items, res.items, { full: doFull, pendingRead: s.pendingAll ? s.items.map((i) => i.name) : s.pendingRead });
      const serverUnread = res.unread ?? s.serverUnread;
      const now = Date.now();
      cancelRetry();
      retries = 0;
      set({
        items,
        serverUnread,
        unread: badge(items, serverUnread, s.pendingRead, s.pendingAll),
        cursor: nextCursor(res, s.cursor),
        skewMs: res.serverTimeMs != null ? res.serverTimeMs - now : s.skewMs,
        lastSyncAt: now,
        lastFullAt: doFull ? now : s.lastFullAt,
        error: null,
        available: true,
      });
      void saveCache(get());
    } catch (e) {
      if (gen !== generation) return;
      if (e instanceof InboxUnavailable) {
        // Not on this server yet: say so once, retry on the next foreground (no timer spam).
        set({ available: false, error: null });
        return;
      }
      const offline = isAxiosError(e) && !e.response;
      set({ error: offline ? 'Offline. Showing saved notifications.' : `Could not refresh: ${mapAxiosError(e).message}` });
      if (retries < MAX_RETRIES) {
        cancelRetry();
        const wait = backoffDelay(retries, { base: 5000 });
        retries += 1;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          if (gen === generation) void get().sync();
        }, wait);
      }
    } finally {
      if (gen === generation) set({ syncing: false });
    }
  };

  const trigger = coalesce<boolean>(runSync, (a, b) => a || b);

  return {
    ...initial,

    activate: async (owner) => {
      if (get().owner === owner) return;
      generation += 1;
      cancelRetry();
      retries = 0;
      const cache = await loadCache(owner);
      set({
        ...initial,
        owner,
        ...(cache
          ? {
              items: cache.items,
              serverUnread: cache.serverUnread,
              cursor: cache.cursor,
              pendingRead: cache.pendingRead,
              pendingAll: cache.pendingAll,
              skewMs: cache.skewMs,
              unread: badge(cache.items, cache.serverUnread, cache.pendingRead, cache.pendingAll),
            }
          : {}),
      });
    },

    sync: (opts) => trigger(!!opts?.full),

    markRead: (names) => {
      const s = get();
      const fresh = names.filter((n) => s.items.some((i) => i.name === n && !i.read) || !s.items.some((i) => i.name === n));
      if (!fresh.length) return;
      const items = applyRead(s.items, fresh);
      const pendingRead = [...new Set([...s.pendingRead, ...fresh])];
      set({ items, pendingRead, unread: badge(items, s.serverUnread, pendingRead, s.pendingAll) });
      void saveCache(get());
      const gen = generation;
      flushPending(gen)
        .then(() => {
          if (gen === generation) void saveCache(get());
        })
        .catch(() => {
          // Stays pending; the next sync sends it again.
        });
    },

    markAllRead: () => {
      const s = get();
      const items = applyRead(s.items, 'all');
      set({ items, pendingAll: true, pendingRead: [], unread: 0 });
      void saveCache(get());
      const gen = generation;
      flushPending(gen)
        .then(() => {
          if (gen !== generation) return;
          set((x) => ({ serverUnread: 0, unread: badge(x.items, 0, x.pendingRead, x.pendingAll) }));
          void saveCache(get());
        })
        .catch(() => {});
    },

    clear: async () => {
      generation += 1;
      cancelRetry();
      retries = 0;
      set({ ...initial });
      await AsyncStorage.removeItem(CACHE_KEY).catch(() => {});
    },
  };
});
