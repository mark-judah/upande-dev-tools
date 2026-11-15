import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type Kind = 'due' | 'digest' | 'assignment' | 'comment' | 'deployment';

export const KIND_LABELS: Record<Kind, string> = {
  due: 'Due reminders',
  digest: 'Morning digest',
  assignment: 'Assignments',
  comment: 'Comments',
  deployment: 'Deployments',
};

const KEY = 'notification_prefs';

type Prefs = { enabled: boolean; kinds: Record<Kind, boolean> };

const DEFAULT_KINDS: Record<Kind, boolean> = { due: true, digest: true, assignment: true, comment: true, deployment: true };

type State = Prefs & {
  hydrated: boolean;
  /** Last token registered with the backend, kept so it can be unregistered. */
  token: string | null;
  hydrate: () => Promise<void>;
  setEnabled: (v: boolean) => void;
  setKind: (k: Kind, v: boolean) => void;
  setToken: (t: string | null) => void;
  shouldShow: (kind?: string) => boolean;
};

const persist = (s: State) =>
  AsyncStorage.setItem(KEY, JSON.stringify({ enabled: s.enabled, kinds: s.kinds, token: s.token })).catch(() => {});

export const useNotificationStore = create<State>((set, get) => ({
  enabled: false,
  kinds: DEFAULT_KINDS,
  token: null,
  hydrated: false,
  async hydrate() {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Prefs> & { token?: string | null };
        set({ enabled: !!p.enabled, kinds: { ...DEFAULT_KINDS, ...p.kinds }, token: p.token ?? null });
      }
    } catch {
      // keep defaults
    }
    set({ hydrated: true });
  },
  setEnabled(v) {
    set({ enabled: v });
    persist(get());
  },
  setKind(k, v) {
    set({ kinds: { ...get().kinds, [k]: v } });
    persist(get());
  },
  setToken(t) {
    set({ token: t });
    persist(get());
  },
  shouldShow(kind) {
    const s = get();
    if (!s.enabled) return false;
    // The backend names the due-date push `task_due`; the toggle is called `due`.
    const k = kind === 'task_due' ? 'due' : kind;
    return k && k in s.kinds ? s.kinds[k as Kind] : true;
  },
}));

/** Whether an in-app alert of this kind should show (for the foreground handler). */
export const shouldShow = (kind?: string) => useNotificationStore.getState().shouldShow(kind);
