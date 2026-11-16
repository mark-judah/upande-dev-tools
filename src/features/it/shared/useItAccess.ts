import { create } from 'zustand';
import { mapAxiosError } from '@/core/api/client';
import { itUsers, type ItMeta } from './it-api';
import { useItSource } from '@/core/it-source/it-source-store';

type Status = 'unknown' | 'loading' | 'yes' | 'no' | 'error';

type State = {
  status: Status;
  isSystemManager: boolean;
  /** Role profiles that can be assigned from here, from `usermgmt.meta`. */
  profiles: ItMeta['profiles'];
  message: string | null;
  /** Checks once per session (pass force to recheck). Resolves to whether the user may use the IT tools. */
  check: (force?: boolean) => Promise<boolean>;
  reset: () => void;
};

/** Whether this user is on the IT Team profile. One cheap call (`usermgmt.meta`); a 403 means no. */
export const useItAccess = create<State>((set, get) => ({
  status: 'unknown',
  isSystemManager: false,
  profiles: [],
  message: null,
  check: async (force) => {
    const { status } = get();
    if (!force && (status === 'yes' || status === 'no' || status === 'loading')) return status === 'yes';
    set({ status: 'loading', message: null });
    try {
      const meta = await itUsers<ItMeta>('meta');
      set({ status: 'yes', isSystemManager: !!meta.is_system_manager, profiles: meta.profiles ?? [] });
      return true;
    } catch (e) {
      const err = mapAxiosError(e);
      if (err.status === 403) {
        set({ status: 'no', message: err.message });
        return false;
      }
      set({ status: 'error', message: err.message });
      return false;
    }
  },
  reset: () => set({ status: 'unknown', isSystemManager: false, profiles: [], message: null }),
}));

// Changing or signing out of the IT data source means a different site: the access check starts over.
let lastSource = useItSource.getState().source?.url ?? null;
useItSource.subscribe((st) => {
  const now = st.source?.url ?? null;
  if (now !== lastSource) {
    lastSource = now;
    useItAccess.getState().reset();
  }
});
