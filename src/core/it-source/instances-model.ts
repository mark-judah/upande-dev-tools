/**
 * The list of IT instances a developer manages from this phone, as plain data and pure functions (no React, no
 * storage, no imports) so it can be tested with `node --test`. The zustand store in `instances-store.ts` wraps it.
 *
 * An instance is a Frappe site with the IT dashboard, signed in to separately from the app's main login. Its session
 * cookie never lives here: it is kept in the phone's secure storage under the instance id.
 */

export type InstanceStatus = 'connected' | 'expired';

export type ItInstance = {
  /** Stable key: the URL without scheme or trailing slash, lower-cased (`instanceId`). */
  id: string;
  url: string;
  email: string;
  fullName: string | null;
  /** What the developer calls it ("Kaitet prod"); the host shows without one. */
  nickname: string | null;
  connectedAt: number;
  lastUsedAt: number;
  status: InstanceStatus;
};

export type InstancesState = {
  list: ItInstance[];
  activeId: string | null;
};

export const EMPTY: InstancesState = { list: [], activeId: null };

/** Most instances kept; the least recently used drop off. */
export const MAX_INSTANCES = 20;

/** `https://Foo.com/` and `foo.com` are the same instance. */
export function instanceId(url: string | null | undefined): string {
  return String(url ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
}

export function hostLabel(url: string): string {
  return String(url).replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

/** The name shown on screen: the nickname, else the host. */
export function instanceTitle(i: Pick<ItInstance, 'url' | 'nickname'>): string {
  return i.nickname?.trim() || hostLabel(i.url);
}

export function findInstance(state: InstancesState, id: string | null | undefined): ItInstance | null {
  if (!id) return null;
  return state.list.find((i) => i.id === id) ?? null;
}

export function activeInstance(state: InstancesState): ItInstance | null {
  return findInstance(state, state.activeId);
}

/** Most recently used first; the list is always kept in this order. */
function sorted(list: ItInstance[]): ItInstance[] {
  return [...list].sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, MAX_INSTANCES);
}

/** Add an instance, or refresh it after a (re-)sign-in, and make it active. A nickname already set is kept. */
export function upsertInstance(
  state: InstancesState,
  input: { url: string; email: string; fullName: string | null; nickname?: string | null },
  now: number,
): InstancesState {
  const id = instanceId(input.url);
  if (!id) return state;
  const prev = findInstance(state, id);
  const next: ItInstance = {
    id,
    url: input.url.replace(/\/+$/, ''),
    email: input.email,
    fullName: input.fullName,
    nickname: input.nickname !== undefined ? cleanNickname(input.nickname) : (prev?.nickname ?? null),
    connectedAt: now,
    lastUsedAt: now,
    status: 'connected',
  };
  return { list: sorted([next, ...state.list.filter((i) => i.id !== id)]), activeId: id };
}

/** Make another saved instance active. Unknown ids leave the state alone. */
export function switchInstance(state: InstancesState, id: string, now: number): InstancesState {
  if (!findInstance(state, id)) return state;
  return { list: sorted(state.list.map((i) => (i.id === id ? { ...i, lastUsedAt: now } : i))), activeId: id };
}

function cleanNickname(n: string | null | undefined): string | null {
  const t = (n ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return t || null;
}

export function renameInstance(state: InstancesState, id: string, nickname: string | null): InstancesState {
  if (!findInstance(state, id)) return state;
  return { ...state, list: state.list.map((i) => (i.id === id ? { ...i, nickname: cleanNickname(nickname) } : i)) };
}

/** Remove an instance. Removing the active one leaves NO active instance: the developer picks the next one. */
export function removeInstance(state: InstancesState, id: string): InstancesState {
  return { list: state.list.filter((i) => i.id !== id), activeId: state.activeId === id ? null : state.activeId };
}

/** A 401 on one instance marks only that instance. */
export function markInstanceExpired(state: InstancesState, id: string): InstancesState {
  const cur = findInstance(state, id);
  if (!cur || cur.status === 'expired') return state;
  return { ...state, list: state.list.map((i) => (i.id === id ? { ...i, status: 'expired' } : i)) };
}

function isStatus(v: unknown): v is InstanceStatus {
  return v === 'connected' || v === 'expired';
}

/** Reads what was saved, dropping anything malformed. Never throws. */
export function parseInstances(raw: string | null | undefined): InstancesState | null {
  if (!raw) return null;
  let p: unknown;
  try {
    p = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!p || typeof p !== 'object') return null;
  const obj = p as { list?: unknown; activeId?: unknown };
  const list: ItInstance[] = [];
  const seen = new Set<string>();
  for (const r of Array.isArray(obj.list) ? obj.list : []) {
    if (!r || typeof r !== 'object') continue;
    const x = r as Record<string, unknown>;
    if (typeof x.url !== 'string' || !instanceId(x.url)) continue;
    const id = instanceId(x.url);
    if (seen.has(id)) continue;
    seen.add(id);
    list.push({
      id,
      url: x.url,
      email: typeof x.email === 'string' ? x.email : '',
      fullName: typeof x.fullName === 'string' ? x.fullName : null,
      nickname: typeof x.nickname === 'string' ? cleanNickname(x.nickname) : null,
      connectedAt: typeof x.connectedAt === 'number' ? x.connectedAt : 0,
      lastUsedAt: typeof x.lastUsedAt === 'number' ? x.lastUsedAt : 0,
      status: isStatus(x.status) ? x.status : 'connected',
    });
  }
  const activeId = typeof obj.activeId === 'string' && seen.has(obj.activeId) ? obj.activeId : null;
  return { list: sorted(list), activeId };
}

export function serializeInstances(state: InstancesState): string {
  return JSON.stringify({ v: 2, list: state.list, activeId: state.activeId });
}

/** The single IT source the app kept before instances (`it_source_v1`). */
export type LegacySource = { url?: unknown; email?: unknown; fullName?: unknown; connectedAt?: unknown };

/**
 * First run after the upgrade: the old single IT source becomes the first (and active) instance, keeping its session
 * so nobody signs in again. Without a saved cookie it comes across as expired (the developer re-signs in one tap).
 * Returns null when there is nothing to migrate.
 */
export function migrateLegacy(legacyRaw: string | null | undefined, hasCookie: boolean, now: number): InstancesState | null {
  if (!legacyRaw) return null;
  let src: LegacySource;
  try {
    src = JSON.parse(legacyRaw) as LegacySource;
  } catch {
    return null;
  }
  if (!src || typeof src.url !== 'string' || !instanceId(src.url)) return null;
  const at = typeof src.connectedAt === 'number' ? src.connectedAt : now;
  const inst: ItInstance = {
    id: instanceId(src.url),
    url: src.url.replace(/\/+$/, ''),
    email: typeof src.email === 'string' ? src.email : '',
    fullName: typeof src.fullName === 'string' ? src.fullName : null,
    nickname: null,
    connectedAt: at,
    lastUsedAt: now,
    status: hasCookie ? 'connected' : 'expired',
  };
  return { list: [inst], activeId: inst.id };
}

/**
 * Whether an HTTP failure means the instance's session is gone. Frappe answers 401 for a refused session, and for an
 * unknown sid it carries on as Guest, marks the response `session_expired: 1` and then refuses the method with 403.
 */
export function isSessionExpiredResponse(status: number | undefined, body: unknown): boolean {
  if (status === 401) return true;
  if (!body || typeof body !== 'object') return false;
  const b = body as { session_expired?: unknown; exc_type?: unknown };
  if (b.exc_type === 'SessionExpired' || b.exc_type === 'AuthenticationError') return true;
  return status === 403 && (b.session_expired === 1 || b.session_expired === true || b.session_expired === '1');
}
