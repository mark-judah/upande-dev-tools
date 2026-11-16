import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { secure } from './secure';

/**
 * Where the IT dashboard's DATA lives. By default that is the site the app is signed in to. A developer
 * can point the IT tools at ANOTHER site with a second, independent sign-in: crashes, devices, support,
 * users and so on then come from there, while tasks, requests and everything else stay on the main site.
 */
export type ItSource = {
  url: string;
  email: string;
  fullName: string | null;
  connectedAt: number;
};

const META_KEY = 'it_source_v1';
const COOKIE_KEY = 'it_source_cookie_v1';
const SITES_KEY = 'it_source_sites_v1';

export type ItSite = { url: string; email: string; fullName: string | null; lastUsedAt: number };

type State = {
  hydrated: boolean;
  source: ItSource | null;
  cookie: string | null;
  /** The saved session was refused (401): ask the user to sign in again. */
  expired: boolean;
  /** Sites used as an IT source before, newest first (never contains passwords). */
  sites: ItSite[];
  hydrate: () => Promise<void>;
  connect: (source: ItSource, cookie: string) => Promise<void>;
  disconnect: () => Promise<void>;
  markExpired: () => void;
  forgetSite: (url: string) => Promise<void>;
};

const keyOf = (url: string) => url.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');

async function writeSites(sites: ItSite[]) {
  await AsyncStorage.setItem(SITES_KEY, JSON.stringify(sites.slice(0, 8))).catch(() => {});
}

export const useItSource = create<State>((set, get) => ({
  hydrated: false,
  source: null,
  cookie: null,
  expired: false,
  sites: [],

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const [meta, cookie, sites] = await Promise.all([AsyncStorage.getItem(META_KEY), secure.get(COOKIE_KEY).catch(() => null), AsyncStorage.getItem(SITES_KEY)]);
      set({
        hydrated: true,
        source: meta ? (JSON.parse(meta) as ItSource) : null,
        cookie: meta ? cookie : null,
        sites: sites ? (JSON.parse(sites) as ItSite[]) : [],
      });
    } catch {
      set({ hydrated: true });
    }
  },

  connect: async (source, cookie) => {
    const rest = get().sites.filter((s) => keyOf(s.url) !== keyOf(source.url));
    const sites = [{ url: source.url, email: source.email, fullName: source.fullName, lastUsedAt: Date.now() }, ...rest];
    set({ source, cookie, expired: false, sites });
    await Promise.all([AsyncStorage.setItem(META_KEY, JSON.stringify(source)), secure.set(COOKIE_KEY, cookie), writeSites(sites)]).catch(() => {});
  },

  disconnect: async () => {
    set({ source: null, cookie: null, expired: false });
    await Promise.all([AsyncStorage.removeItem(META_KEY), secure.remove(COOKIE_KEY)]).catch(() => {});
  },

  markExpired: () => {
    if (get().source && !get().expired) set({ expired: true });
  },

  forgetSite: async (url) => {
    const sites = get().sites.filter((s) => keyOf(s.url) !== keyOf(url));
    set({ sites });
    await writeSites(sites);
  },
}));

export const sameSite = (a: string, b: string) => keyOf(a) === keyOf(b);
export const siteLabel = (url: string) => url.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
