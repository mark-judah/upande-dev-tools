import { create } from 'zustand';
import { storage, StorageKeys } from '@/core/storage';
import { call } from '@/core/api/call';
import { mapAxiosError } from '@/core/api/client';

/** A Request Type name from the backend (Bug, Feature, Chore, ...). */
export type RequestType = string;

export type Capture = {
  id: string;
  /** Items persisted before tasks existed have no kind: they are requests. */
  kind?: 'task' | 'request';
  title: string;
  request_type?: RequestType;
  description?: string;
  project?: string;
  tags?: string[];
  priority?: string;
  /** Task only: yyyy-MM-dd. */
  complete_by?: string;
  /** Task only: the signed-in user's email, so it lands on My Day. */
  assign_to?: string;
  /** Legacy: also promote a Note to a Task (items queued by older builds). */
  addToToday?: boolean;
  createdAt: number;
};

export type CaptureInput = Omit<Capture, 'id' | 'createdAt'>;

export type SubmitResult =
  | { status: 'sent'; kind: 'task' | 'request'; name?: string; filedAsRequest: boolean }
  | { status: 'queued' }
  | { status: 'rejected'; message: string };

type State = {
  queue: Capture[];
  syncing: boolean;
  hydrate: () => Promise<void>;
  /** Sends now; keeps the capture in the queue when offline. A server refusal is returned, not queued. */
  submit: (c: CaptureInput) => Promise<SubmitResult>;
  flush: () => Promise<number>;
};

async function persist(queue: Capture[]) {
  await storage.set(StorageKeys.captureQueue, JSON.stringify(queue)).catch(() => {});
}

type Sent = { kind: 'task' | 'request'; name?: string; filedAsRequest: boolean };

async function send(c: Capture): Promise<Sent> {
  if (c.kind === 'task') {
    // Without both Dev Team and a manager role the server files a "Chore" Request instead of a Task.
    const doc = await call<{ name?: string; doctype?: string }>('board.create_task', {
      project: c.project,
      subject: c.title,
      tags: c.tags,
      description: c.description,
      priority: c.priority,
      complete_by: c.complete_by,
      assign_to: c.assign_to,
    });
    const filedAsRequest = doc?.doctype === 'Request';
    return { kind: filedAsRequest ? 'request' : 'task', name: doc?.name, filedAsRequest };
  }
  const doc = await call<{ name: string }>('requests.create_request', {
    title: c.title,
    request_type: c.request_type ?? 'Note',
    description: c.description,
    project: c.project,
    priority: c.priority,
    tags: c.tags,
    source: 'Mobile App',
  });
  if (c.addToToday && c.request_type === 'Note') await call('requests.promote_to_task', { name: doc.name });
  return { kind: 'request', name: doc?.name, filedAsRequest: false };
}

/** True when retrying can never help (the server understood and refused). */
function isRefusal(err: unknown): string | null {
  const e = mapAxiosError(err);
  const status = e.status ?? 0;
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return e.message;
  return null;
}

export const useCaptureQueue = create<State>((set, get) => ({
  queue: [],
  syncing: false,

  hydrate: async () => {
    try {
      const raw = await storage.get(StorageKeys.captureQueue);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        const queue = (parsed as Capture[])
          .filter((q) => q && typeof q.title === 'string')
          .map((q) => ({ ...q, kind: q.kind ?? 'request' }));
        set({ queue });
      }
    } catch {
      // a corrupt queue is dropped rather than blocking the app
    }
  },

  submit: async (input) => {
    const item: Capture = { ...input, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, createdAt: Date.now() };
    // Persist first: a crash or lost signal mid-send must never lose the capture.
    const queue = [...get().queue, item];
    set({ queue });
    await persist(queue);
    const remove = async () => {
      const rest = get().queue.filter((q) => q.id !== item.id);
      set({ queue: rest });
      await persist(rest);
    };
    try {
      const sent = await send(item);
      await remove();
      return { status: 'sent', ...sent };
    } catch (err) {
      const refused = isRefusal(err);
      if (refused) {
        await remove();
        return { status: 'rejected', message: refused };
      }
      return { status: 'queued' };
    }
  },

  flush: async () => {
    if (get().syncing || get().queue.length === 0) return 0;
    set({ syncing: true });
    let sent = 0;
    try {
      for (const item of [...get().queue]) {
        try {
          await send(item);
        } catch (err) {
          if (isRefusal(err)) {
            // A refused item would block the queue forever: drop it and carry on.
            const rest = get().queue.filter((q) => q.id !== item.id);
            set({ queue: rest });
            await persist(rest);
            continue;
          }
          break; // still offline or the server is unhappy: retry on the next trigger
        }
        const rest = get().queue.filter((q) => q.id !== item.id);
        set({ queue: rest });
        await persist(rest);
        sent += 1;
      }
    } finally {
      set({ syncing: false });
    }
    return sent;
  },
}));
