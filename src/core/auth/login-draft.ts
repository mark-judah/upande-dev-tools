import { storage, StorageKeys } from '@/core/storage';
import { instanceKey } from './known-instances';

/**
 * What was typed on the add-a-site form. Kept on every keystroke and only
 * dropped once a sign-in to that site succeeds: Cancel, a failed check, a
 * wrong password or the app being backgrounded never costs the person their typing.
 */
export type LoginDraft = { url: string; email: string };

export const loginDraft = {
  async get(): Promise<LoginDraft> {
    try {
      const raw = await storage.get(StorageKeys.loginDraft);
      const p = raw ? (JSON.parse(raw) as Partial<LoginDraft>) : {};
      return { url: typeof p.url === 'string' ? p.url : '', email: typeof p.email === 'string' ? p.email : '' };
    } catch {
      return { url: '', email: '' };
    }
  },

  async set(draft: LoginDraft): Promise<void> {
    if (!draft.url && !draft.email) {
      await storage.remove(StorageKeys.loginDraft).catch(() => {});
      return;
    }
    await storage.set(StorageKeys.loginDraft, JSON.stringify(draft)).catch(() => {});
  },

  async clear(): Promise<void> {
    await storage.remove(StorageKeys.loginDraft).catch(() => {});
  },

  /** A sign-in to `url` worked: its draft is spent. A draft for another address stays. */
  async clearIfSite(url: string): Promise<void> {
    const d = await loginDraft.get();
    if (d.url && instanceKey(d.url) === instanceKey(url)) await loginDraft.clear();
  },
};
