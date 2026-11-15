import { create } from 'zustand';
import { mapAxiosError } from '@/core/api/client';
import { storage, StorageKeys } from '@/core/storage';
import { fetchAchievements, type Achievements } from './achievements-api';

type State = {
  data: Achievements | null;
  loading: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  /** Fetches fresh totals; returns them, or null if the request failed (cache is kept). */
  load: () => Promise<Achievements | null>;
};

let seq = 0;

export const useAchievements = create<State>((set, get) => ({
  data: null,
  loading: false,
  error: null,

  hydrate: async () => {
    if (get().data) return;
    try {
      const raw = await storage.get(StorageKeys.achievementsCache);
      if (raw && !get().data) set({ data: JSON.parse(raw) as Achievements });
    } catch {
      // a bad cache is just a cache miss
    }
  },

  load: async () => {
    const mine = ++seq; // latest-wins
    set({ loading: true, error: null });
    try {
      const data = await fetchAchievements();
      if (mine === seq) {
        set({ data, loading: false });
        storage.set(StorageKeys.achievementsCache, JSON.stringify(data)).catch(() => {});
      }
      return data;
    } catch (e) {
      if (mine === seq) set({ loading: false, error: mapAxiosError(e).message });
      return null;
    }
  },
}));
