/**
 * The notification inbox as pure data: parsing the server's answer defensively, merging it into the local cache
 * (deduped by `name`), unread counts, read marks that have not reached the server yet, and the sync cursor.
 * No imports, so it runs under `node --test`.
 *
 * Server contract: `upande_mobile.api.notifications.list_notifications(app, since, limit)` answers
 * `{ items: [{ name, title, body, route, kind, data, created, read }], unread, server_time }`, newest first.
 */

export type InboxItem = {
  name: string;
  title: string;
  body: string;
  route: string | null;
  kind: string | null;
  data: Record<string, unknown> | null;
  /** As the server sent it (ISO, or Frappe's "YYYY-MM-DD HH:MM:SS"). */
  created: string;
  /** `created` parsed the same way as `server_time`, so ages are measured on the server's clock. */
  createdMs: number;
  read: boolean;
};

export type ListResult = { items: InboxItem[]; unread: number | null; serverTime: string | null; serverTimeMs: number | null };

export const MAX_ITEMS = 200;
/** Incremental syncs ask a little before the last server time, so a row inserted while the last answer was being built is not missed. Duplicates are merged by name. */
export const CURSOR_OVERLAP_MS = 60 * 1000;

/**
 * Parses an ISO or Frappe datetime to epoch ms. A value with no zone is read as UTC: the server's clock and zone are
 * unknown, but `created` and `server_time` come from the same server and are parsed alike, so their DIFFERENCE (the
 * age shown) is right whatever the phone's clock or zone says.
 */
export function parseServerTime(v: unknown): number | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  let s = v.trim().replace(' ', 'T');
  // Frappe gives microseconds; Date wants at most milliseconds.
  s = s.replace(/(\.\d{3})\d+/, '$1');
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z';
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

/** Formats epoch ms back to an ISO string for the `since` argument. */
export function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

function str(v: unknown, max = 2000): string {
  return typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' ? String(v) : '';
}

function parseData(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === 'string' && v.trim().startsWith('{')) {
    try {
      const p = JSON.parse(v) as unknown;
      return p && typeof p === 'object' && !Array.isArray(p) ? (p as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** One row from the server, or null when it is unusable (no name). Every other field gets a safe default. */
export function sanitizeItem(raw: unknown): InboxItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name, 140).trim();
  if (!name) return null;
  const created = str(r.created ?? r.creation, 64);
  return {
    name,
    title: str(r.title, 300).trim() || 'Notification',
    body: str(r.body, 2000),
    route: typeof r.route === 'string' && r.route.trim() ? r.route.trim().slice(0, 300) : null,
    kind: typeof r.kind === 'string' && r.kind.trim() ? r.kind.trim().slice(0, 40) : null,
    data: parseData(r.data),
    created,
    createdMs: parseServerTime(created) ?? 0,
    read: r.read === true || r.read === 1 || r.read === '1',
  };
}

/** The whole answer, defensively: a missing list is empty, malformed rows are dropped, duplicates collapse. */
export function parseListResponse(raw: unknown): ListResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { items?: unknown; unread?: unknown; server_time?: unknown };
  const seen = new Set<string>();
  const items: InboxItem[] = [];
  for (const row of Array.isArray(r.items) ? r.items : []) {
    const it = sanitizeItem(row);
    if (!it || seen.has(it.name)) continue;
    seen.add(it.name);
    items.push(it);
  }
  const unread = typeof r.unread === 'number' && Number.isFinite(r.unread) && r.unread >= 0 ? Math.floor(r.unread) : null;
  const serverTime = typeof r.server_time === 'string' ? r.server_time : null;
  return { items, unread, serverTime, serverTimeMs: parseServerTime(serverTime) };
}

function byNewest(a: InboxItem, b: InboxItem): number {
  return b.createdMs - a.createdMs || (a.name < b.name ? 1 : a.name > b.name ? -1 : 0);
}

/**
 * Merges a server answer into the cache. Rows are keyed by `name`, so the same notification seen through a push, an
 * incremental sync and a full refresh is one row. The server's copy wins, except that a read mark made on this
 * phone and not yet confirmed (`pendingRead`) stays read.
 *
 * `full` (a refresh from the top): the newest page replaces what it covers; cached rows OLDER than that page are kept
 * (the server only returned one page), rows inside its time range that it no longer returns are dropped.
 */
export function mergeInbox(current: InboxItem[], incoming: InboxItem[], opts: { full: boolean; pendingRead?: Iterable<string> }): InboxItem[] {
  const map = new Map<string, InboxItem>();
  if (opts.full && incoming.length) {
    const oldest = Math.min(...incoming.map((i) => i.createdMs));
    for (const c of current) if (c.createdMs < oldest) map.set(c.name, c);
  } else if (!opts.full) {
    for (const c of current) map.set(c.name, c);
  }
  for (const i of incoming) map.set(i.name, i);
  const pending = new Set(opts.pendingRead ?? []);
  const out = [...map.values()].map((i) => (pending.has(i.name) && !i.read ? { ...i, read: true } : i));
  return out.sort(byNewest).slice(0, MAX_ITEMS);
}

export function countUnread(items: InboxItem[]): number {
  return items.reduce((n, i) => n + (i.read ? 0 : 1), 0);
}

/**
 * The badge number. The server's count covers rows beyond the cached page, so it wins when known, minus read marks
 * this phone has made that the server has not confirmed yet. Never below what the cache itself shows unread.
 */
export function unreadBadge(serverUnread: number | null, items: InboxItem[], pendingCount: number): number {
  const local = countUnread(items);
  if (serverUnread == null) return local;
  return Math.max(local, serverUnread - pendingCount, 0);
}

/** Marks rows read locally. `'all'` marks every row. Returns the same array when nothing changed. */
export function applyRead(items: InboxItem[], names: string[] | 'all'): InboxItem[] {
  const set = names === 'all' ? null : new Set(names);
  let changed = false;
  const out = items.map((i) => {
    if (i.read || (set && !set.has(i.name))) return i;
    changed = true;
    return { ...i, read: true };
  });
  return changed ? out : items;
}

/** The `since` for the next incremental sync: the server's own time (never the phone's), minus a small overlap. */
export function nextCursor(res: ListResult, prev: string | null): string | null {
  const base = res.serverTimeMs ?? (res.items.length ? Math.max(...res.items.map((i) => i.createdMs)) : null);
  if (base == null || base <= 0) return prev;
  return toIso(base - CURSOR_OVERLAP_MS);
}

/** "now", "5m", "3h", "2d", then a date: how long ago, measured on the server's clock. */
export function shortAge(createdMs: number, serverNowMs: number): string {
  if (!createdMs) return '';
  const s = Math.max(0, Math.round((serverNowMs - createdMs) / 1000));
  if (s < 60) return 'now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d}d`;
  return new Date(createdMs).toISOString().slice(0, 10);
}

/**
 * Coalesces concurrent calls: while one run is in flight, further calls share it and ask for exactly one more run
 * afterwards (so a push that arrives mid-sync is still picked up). Returns the trigger function.
 */
export function coalesce<A>(run: (arg: A) => Promise<void>, merge: (a: A, b: A) => A): (arg: A) => Promise<void> {
  let inFlight: Promise<void> | null = null;
  let queued: A | null = null;
  let hasQueued = false;
  return (arg: A) => {
    if (inFlight) {
      queued = hasQueued ? merge(queued as A, arg) : arg;
      hasQueued = true;
      return inFlight;
    }
    inFlight = (async () => {
      try {
        let next: A = arg;
        for (;;) {
          await run(next).catch(() => {});
          if (!hasQueued) break;
          next = queued as A;
          queued = null;
          hasQueued = false;
        }
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  };
}
