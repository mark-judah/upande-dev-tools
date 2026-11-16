import { storage } from '@/core/storage';

const KEY = 'it_canned_replies';
export const DEFAULT_REPLIES = [
  'Thanks for reporting this. We are looking into it.',
  'Could you share a screenshot of what you see?',
  'Please update the app to the latest version and try again.',
  'This is fixed. Please reopen the app and let us know.',
];

export async function loadReplies(): Promise<string[]> {
  try {
    const raw = await storage.get(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(list) && list.every((x) => typeof x === 'string') ? (list as string[]) : DEFAULT_REPLIES;
  } catch {
    return DEFAULT_REPLIES;
  }
}

export async function saveReplies(list: string[]): Promise<void> {
  try {
    await storage.set(KEY, JSON.stringify(list));
  } catch {
    // Local only: losing the edit is harmless.
  }
}
