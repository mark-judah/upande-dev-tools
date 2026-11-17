import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { PushProblem } from './push-model';

export type Kind = 'due' | 'digest' | 'assignment' | 'request' | 'comment' | 'deployment';

export const KIND_LABELS: Record<Kind, string> = {
  due: 'Due reminders',
  digest: 'Morning digest',
  assignment: 'Assignments',
  request: 'Request updates',
  comment: 'Comments',
  deployment: 'Deployments',
};

const KEY = 'notification_prefs';

const DEFAULT_KINDS: Record<Kind, boolean> = { due: true, digest: true, assignment: true, request: true, comment: true, deployment: true };

/** Server `data.kind` values -> the toggle that controls them. Anything not listed (support, new kinds) always shows. */
const KIND_ALIASES: Record<string, Kind> = { task: 'assignment', task_due: 'due', event: 'request' };

/** The last token the server accepted, for whom (`site|email`), and when: re-registration is skipped while it holds. */
export type Registration = { token: string; owner: string; at: number };

/** Where push registration stands right now, for the Settings section. */
export type PushPhase = 'idle' | 'working' | 'registered' | 'retrying' | 'failed';

type Persisted = { enabled: boolean; kinds: Record<Kind, boolean>; registration: Registration | null };

type State = Persisted & {
  hydrated: boolean;
  phase: PushPhase;
  problem: PushProblem | null;
  /** Short human message for `problem` (never a raw error). */
  message: string | null;
  hydrate: () => Promise<void>;
  setEnabled: (v: boolean) => void;
  setKind: (k: Kind, v: boolean) => void;
  setRegistration: (r: Registration | null) => void;
  setPhase: (phase: PushPhase, problem?: PushProblem | null, message?: string | null) => void;
  shouldShow: (kind?: string) => boolean;
};

let hydrating: Promise<void> | null = null;

const persist = (s: Persisted) =>
  AsyncStorage.setItem(KEY, JSON.stringify({ enabled: s.enabled, kinds: s.kinds, registration: s.registration })).catch(() => {});

/** Push preferences (on/off, which in-app alerts show) and the live registration status. */
export const useNotificationStore = create<State>((set, get) => ({
  enabled: false,
  kinds: DEFAULT_KINDS,
  registration: null,
  hydrated: false,
  phase: 'idle',
  problem: null,
  message: null,
  hydrate() {
    if (get().hydrated) return Promise.resolve();
    if (hydrating) return hydrating;
    hydrating = (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) {
          const p = JSON.parse(raw) as Partial<Persisted> & { token?: unknown };
          const r = p.registration;
          set({
            enabled: !!p.enabled,
            kinds: { ...DEFAULT_KINDS, ...(p.kinds && typeof p.kinds === 'object' ? p.kinds : {}) },
            registration:
              r && typeof r === 'object' && typeof r.token === 'string' && typeof r.owner === 'string' && typeof r.at === 'number' ? r : null,
          });
        }
      } catch {
        // keep defaults
      }
      set({ hydrated: true });
      hydrating = null;
    })();
    return hydrating;
  },
  setEnabled(v) {
    set({ enabled: v });
    persist(get());
  },
  setKind(k, v) {
    set({ kinds: { ...get().kinds, [k]: v } });
    persist(get());
  },
  setRegistration(r) {
    set({ registration: r });
    persist(get());
  },
  setPhase(phase, problem = null, message = null) {
    set({ phase, problem, message });
  },
  shouldShow(kind) {
    const s = get();
    if (!kind) return true;
    const k = KIND_ALIASES[kind] ?? kind;
    // Unknown kinds are shown, never silently dropped (own-property check: 'constructor' is not a kind).
    return Object.prototype.hasOwnProperty.call(DEFAULT_KINDS, k) ? s.kinds[k as Kind] !== false : true;
  },
}));

/** Whether an in-app alert of this kind should show (for the foreground handler). */
export const shouldShow = (kind?: string) => useNotificationStore.getState().shouldShow(kind);
