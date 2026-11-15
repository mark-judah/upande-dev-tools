import { create } from 'zustand';
import { storage, StorageKeys } from '@/core/storage';
import { call } from '@/core/api/call';

export type RequestType = 'Note' | 'Bug' | 'Feature' | 'Question' | 'Master Data';

export type Capture = {
  id: string;
  title: string;
  request_type: RequestType;
  description?: string;
  project?: string;
  /** Also promote to a Task planned for today (Notes only). */
  addToToday?: boolean;
  createdAt: number;
};

type State = {
  queue: Capture[];
  syncing: boolean;
  hydrate: () => Promise<void>;
  /** Sends now; keeps the capture in the queue if the send fails. Returns true when sent. */
  submit: (c: Omit<Capture, 'id' | 'createdAt'>) => Promise<boolean>;
  flush: () => Promise<number>;
};

async function persist(queue: Capture[]) {
  await storage.set(StorageKeys.captureQueue, JSON.stringify(queue)).catch(() => {});
}

async function send(c: Capture) {
  const doc = await call<{ name: string }>('requests.create_request', {
    title: c.title,
    request_type: c.request_type,
    description: c.description,
    project: c.project,
    source: 'Mobile App',
  });
  if (c.addToToday && c.request_type === 'Note') await call('requests.promote_to_task', { name: doc.name, planned_today: 1 });
}

export const useCaptureQueue = create<State>((set, get) => ({
  queue: [],
  syncing: false,

  hydrate: async () => {
    try {
      const raw = await storage.get(StorageKeys.captureQueue);
      if (raw) set({ queue: JSON.parse(raw) as Capture[] });
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
    try {
      await send(item);
      const rest = get().queue.filter((q) => q.id !== item.id);
      set({ queue: rest });
      await persist(rest);
      return true;
    } catch {
      return false;
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
          const rest = get().queue.filter((q) => q.id !== item.id);
          set({ queue: rest });
          await persist(rest);
          sent += 1;
        } catch {
          break; // still offline or the server is unhappy: retry on the next trigger
        }
      }
    } finally {
      set({ syncing: false });
    }
    return sent;
  },
}));
