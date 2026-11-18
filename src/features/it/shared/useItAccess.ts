import { create } from 'zustand';
import { mapAxiosError } from '@/core/api/client';
import { itUsers, type ItMeta } from './it-api';
import { useItInstances } from '@/core/it-source/instances-store';
import { isStaleInstanceError, NoInstanceError } from '@/core/it-source/it-client';

type Status = 'unknown' | 'loading' | 'yes' | 'no' | 'error' | 'none';

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
    await useItInstances.getState().hydrate();
    // No instance chosen: nothing to ask, and never the main site.
    if (!useItInstances.getState().activeId) {
      set({ status: 'none', message: null });
      return false;
    }
    const epoch = useItInstances.getState().epoch;
    set({ status: 'loading', message: null });
    try {
      const meta = await itUsers<ItMeta>('meta');
      if (epoch !== useItInstances.getState().epoch) return false;
      set({ status: 'yes', isSystemManager: !!meta.is_system_manager, profiles: meta.profiles ?? [] });
      return true;
    } catch (e) {
      // The instance changed mid-check: the reset below has already started a fresh check state.
      if (isStaleInstanceError(e) || epoch !== useItInstances.getState().epoch) return false;
      if (e instanceof NoInstanceError) {
        set({ status: 'none', message: null });
        return false;
      }
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

// Switching, removing or re-signing in to the active instance means different data: the access check starts over.
let lastEpoch = useItInstances.getState().epoch;
let lastActive = useItInstances.getState().activeId;
useItInstances.subscribe((st) => {
  if (st.epoch !== lastEpoch || st.activeId !== lastActive) {
    lastEpoch = st.epoch;
    lastActive = st.activeId;
    useItAccess.getState().reset();
  }
});
