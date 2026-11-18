import { isAxiosError } from 'axios';
import { callMethod } from '@/core/api/call';
import { parseListResponse, parseServerTime, toIso, type ListResult } from './inbox-model';

/**
 * The inbox endpoints on the MAIN site (upande_mobile, see the notify contract). Always for the signed-in user only.
 * Until the server ships them they answer 404 / "method not found": `InboxUnavailable` lets the app say so quietly.
 *
 * Development: set EXPO_PUBLIC_MOCK_INBOX=1 (dev builds only) to serve a fake inbox from memory.
 */
export const APP_NAME = 'Upande Dev Tools';
const BASE = 'upande_mobile.api.notifications';

export class InboxUnavailable extends Error {
  readonly code = 'inbox_unavailable';
  constructor() {
    super('The inbox is not available on this server yet.');
  }
}

/** A 404, or Frappe's ways of saying the method does not exist (older versions answer 417/500 with an import error). */
export function isMissingMethod(e: unknown): boolean {
  if (!isAxiosError(e) || !e.response) return false;
  if (e.response.status === 404) return true;
  const body = e.response.data as { exc_type?: string; exception?: string; _server_messages?: string } | string | undefined;
  const text = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  const exc = typeof body === 'object' && body ? body.exc_type : undefined;
  return (
    exc === 'ModuleNotFoundError' ||
    exc === 'ImportError' ||
    (exc === 'AttributeError' && /notifications/.test(text)) ||
    /Failed to get method|No module named|has no attribute '(list_notifications|unread_count|mark_read)'/.test(text)
  );
}

const MOCK = __DEV__ && process.env.EXPO_PUBLIC_MOCK_INBOX === '1';

async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (isMissingMethod(e)) throw new InboxUnavailable();
    throw e;
  }
}

export async function listNotifications(since: string | null, limit = 50): Promise<ListResult> {
  if (MOCK) return mock.list(since, limit);
  const raw = await guarded(() => callMethod<unknown>(`${BASE}.list_notifications`, { app: APP_NAME, since: since ?? undefined, limit }, true));
  const parsed = parseListResponse(raw);
  if (!parsed) throw new Error('The server sent an inbox this app cannot read.');
  return parsed;
}

export async function markRead(names: string[] | 'all'): Promise<number> {
  if (MOCK) return mock.markRead(names);
  const args = names === 'all' ? { app: APP_NAME, all: 1 } : { app: APP_NAME, names };
  const raw = await guarded(() => callMethod<{ updated?: number } | null>(`${BASE}.mark_read`, args));
  return typeof raw?.updated === 'number' ? raw.updated : 0;
}

/** In-memory stand-in for the server, shaped exactly like the contract (dev only). */
const mock = (() => {
  const rows: { name: string; title: string; body: string; route: string; kind: string; data: string; created: string; read: boolean }[] = [];
  const now = Date.now();
  const add = (i: number, title: string, body: string, route: string, kind: string, agoMin: number) =>
    rows.push({ name: `MN-${String(i).padStart(5, '0')}`, title, body, route, kind, data: '{}', created: toIso(now - agoMin * 60000), read: agoMin > 600 });
  add(1, 'Deployment approved', 'kaitet-group: upande_core v2.3 is going out tonight', '/deployments', 'deployment', 3);
  add(2, 'New task for you', 'Fix the stock visibility totals', '/backlog', 'task', 45);
  add(3, 'Request updated', 'Label printer request moved to In progress', '/requests', 'event', 180);
  add(4, 'Morning digest', '5 tasks due today', '/', 'digest', 900);
  add(5, 'Odd payload', 'Its route is outside the allowlist and must not open', 'https://evil.example/x', 'event', 1200);
  return {
    async list(since: string | null, limit: number): Promise<ListResult> {
      await new Promise((r) => setTimeout(r, 400));
      const after = parseServerTime(since);
      const items = rows.filter((r) => after == null || (parseServerTime(r.created) ?? 0) > after).slice(0, limit);
      return parseListResponse({ items, unread: rows.filter((r) => !r.read).length, server_time: toIso(Date.now()) })!;
    },
    async markRead(names: string[] | 'all'): Promise<number> {
      let n = 0;
      for (const r of rows) {
        if (r.read || (names !== 'all' && !names.includes(r.name))) continue;
        r.read = true;
        n += 1;
      }
      return n;
    },
  };
})();
