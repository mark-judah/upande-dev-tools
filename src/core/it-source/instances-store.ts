import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeKey } from '@/core/auth/secure-storage';
import { secure } from './secure';
import {
  activeInstance,
  EMPTY,
  findInstance,
  markInstanceExpired,
  migrateLegacy,
  parseInstances,
  removeInstance,
  renameInstance,
  serializeInstances,
  switchInstance,
  upsertInstance,
  type InstancesState,
  type ItInstance,
} from './instances-model';

/**
 * The IT instances this developer manages (users, apps, devices, updates...), each with its own sign-in, and which
 * one is active. Every IT screen talks to the ACTIVE instance only (see `it-client.ts`); there is no fallback to the
 * app's main site. The list is plain AsyncStorage; each instance's session cookie is in secure storage (the OS
 * keystore on a phone), keyed by instance, and mirrored in memory here so requests do not hit the keystore each time.
 */

const LIST_KEY = 'it_instances_v2';
const cookieKey = (id: string) => `it_instance_cookie.${safeKey(id)}`;

// What the app stored when it had a single IT source. Read once, migrated, then removed.
const LEGACY_META = 'it_source_v1';
const LEGACY_COOKIE = 'it_source_cookie_v1';
const LEGACY_SITES = 'it_source_sites_v1';
const LEGACY_DRAFT = 'it_source_draft_v1';

type State = InstancesState & {
  hydrated: boolean;
  /**
   * Bumped whenever what the IT screens should show changes: the active instance switched, was removed, or was
   * signed in again. Requests capture it and drop answers that arrive after it moved (see `it-client.ts`), and
   * `ItGate` keys its subtree by it so every IT screen starts over with empty state.
   */
  epoch: number;
  /** Session cookies by instance id. In memory only; persisted in secure storage. */
  cookies: Record<string, string>;
  hydrate: () => Promise<void>;
  /** Save a fresh sign-in (new instance or re-sign-in) and make it active. */
  add: (input: { url: string; email: string; fullName: string | null }, cookie: string) => Promise<ItInstance>;
  switchTo: (id: string) => Promise<void>;
  rename: (id: string, nickname: string | null) => Promise<void>;
  /** Remove an instance and wipe its session from this phone. */
  remove: (id: string) => Promise<void>;
  /** The instance refused its session (401): only it is marked, the others are untouched. */
  markExpired: (id: string) => void;
  /** Forget every IT session on this phone (used by "Forget this device"); the list stays, all expired. */
  signOutAll: () => Promise<void>;
};

let hydrating: Promise<void> | null = null;

function snapshot(s: InstancesState): InstancesState {
  return { list: s.list, activeId: s.activeId };
}

async function persist(s: InstancesState): Promise<void> {
  await AsyncStorage.setItem(LIST_KEY, serializeInstances(s)).catch(() => {});
}

async function readLegacy(): Promise<InstancesState | null> {
  const [meta, cookie] = await Promise.all([
    AsyncStorage.getItem(LEGACY_META).catch(() => null),
    secure.get(LEGACY_COOKIE).catch(() => null),
  ]);
  const migrated = migrateLegacy(meta, !!cookie, Date.now());
  if (migrated && cookie && migrated.activeId) await secure.set(cookieKey(migrated.activeId), cookie).catch(() => {});
  return migrated;
}

async function dropLegacy(): Promise<void> {
  await Promise.all([
    AsyncStorage.multiRemove([LEGACY_META, LEGACY_SITES, LEGACY_DRAFT]).catch(() => {}),
    secure.remove(LEGACY_COOKIE).catch(() => {}),
  ]);
}

export const useItInstances = create<State>((set, get) => ({
  ...EMPTY,
  hydrated: false,
  epoch: 0,
  cookies: {},

  hydrate: () => {
    if (get().hydrated) return Promise.resolve();
    if (hydrating) return hydrating;
    hydrating = (async () => {
      try {
        let state = parseInstances(await AsyncStorage.getItem(LIST_KEY).catch(() => null));
        if (!state) {
          // First run on this version: bring the old single IT source across, session included.
          state = (await readLegacy()) ?? EMPTY;
          await persist(state);
          await dropLegacy();
        }
        const cookies: Record<string, string> = {};
        await Promise.all(
          state.list.map(async (i) => {
            const c = await secure.get(cookieKey(i.id)).catch(() => null);
            if (c) cookies[i.id] = c;
          }),
        );
        // A "connected" instance whose cookie is gone (keystore wiped, restored backup) can only be expired.
        for (const i of state.list) if (!cookies[i.id]) state = markInstanceExpired(state, i.id);
        set({ ...snapshot(state), cookies, hydrated: true });
      } catch {
        set({ hydrated: true });
      } finally {
        hydrating = null;
      }
    })();
    return hydrating;
  },

  add: async (input, cookie) => {
    await get().hydrate();
    const next = upsertInstance(snapshot(get()), input, Date.now());
    const id = next.activeId!;
    await secure.set(cookieKey(id), cookie).catch(() => {});
    set((s) => ({ ...next, cookies: { ...s.cookies, [id]: cookie }, epoch: s.epoch + 1 }));
    await persist(next);
    return findInstance(next, id)!;
  },

  switchTo: async (id) => {
    await get().hydrate();
    const cur = snapshot(get());
    if (!findInstance(cur, id)) return;
    const changed = cur.activeId !== id;
    const next = switchInstance(cur, id, Date.now());
    set((s) => ({ ...next, epoch: changed ? s.epoch + 1 : s.epoch }));
    await persist(next);
  },

  rename: async (id, nickname) => {
    const next = renameInstance(snapshot(get()), id, nickname);
    set(next);
    await persist(next);
  },

  remove: async (id) => {
    const cur = snapshot(get());
    const wasActive = cur.activeId === id;
    const next = removeInstance(cur, id);
    set((s) => {
      const cookies = { ...s.cookies };
      delete cookies[id];
      return { ...next, cookies, epoch: wasActive ? s.epoch + 1 : s.epoch };
    });
    await Promise.all([persist(next), secure.remove(cookieKey(id)).catch(() => {})]);
  },

  markExpired: (id) => {
    const cur = snapshot(get());
    const next = markInstanceExpired(cur, id);
    if (next === cur) return;
    set((s) => {
      const cookies = { ...s.cookies };
      delete cookies[id];
      return { ...next, cookies };
    });
    void persist(next);
    void secure.remove(cookieKey(id)).catch(() => {});
  },

  signOutAll: async () => {
    await get().hydrate();
    let next = snapshot(get());
    for (const i of next.list) next = markInstanceExpired(next, i.id);
    const ids = next.list.map((i) => i.id);
    set((s) => ({ ...next, cookies: {}, epoch: s.epoch + 1 }));
    await Promise.all([persist(next), ...ids.map((id) => secure.remove(cookieKey(id)).catch(() => {}))]);
  },
}));

export type ActiveEndpoint = { id: string; baseUrl: string; cookie: string | null; epoch: number; instance: ItInstance };

/** The active instance and its session, or null when none is chosen. Hydrates on first use. */
export async function getActiveEndpoint(): Promise<ActiveEndpoint | null> {
  await useItInstances.getState().hydrate();
  const st = useItInstances.getState();
  const inst = activeInstance(st);
  if (!inst) return null;
  return { id: inst.id, baseUrl: inst.url, cookie: st.cookies[inst.id] ?? null, epoch: st.epoch, instance: inst };
}

/** Hook: the active instance (null when none). */
export function useActiveInstance(): ItInstance | null {
  return useItInstances((s) => activeInstance(s));
}
