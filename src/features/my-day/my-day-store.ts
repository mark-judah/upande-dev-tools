import { create } from 'zustand';
import { call } from '@/core/api/call';
import { mapAxiosError } from '@/core/api/client';
import { TASK_STAGE, type Meeting, type Stage, type TaskRow } from '@/features/shared/types';

type Day = { date: string; tasks: TaskRow[]; meetings: Meeting[] };

type State = {
  day: Day | null;
  backlog: TaskRow[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  /** Optimistic: flips the row first and rolls back if the server refuses. Returns the new stage on success. */
  moveTask: (name: string, stage: Stage) => Promise<Stage | null>;
};

let seq = 0;

export const useMyDay = create<State>((set, get) => ({
  day: null,
  backlog: [],
  loading: false,
  error: null,

  load: async () => {
    const mine = ++seq; // latest-wins: a slow older response never overwrites a newer one
    set({ loading: true, error: null });
    try {
      const [day, backlog] = await Promise.all([
        call<Day>('requests.get_my_day', {}, true),
        call<TaskRow[]>('requests.get_developer_backlog', {}, true),
      ]);
      if (mine === seq) set({ day, backlog, loading: false });
    } catch (e) {
      if (mine === seq) set({ loading: false, error: mapAxiosError(e).message });
    }
  },

  moveTask: async (name, stage) => {
    const before = { day: get().day, backlog: get().backlog };
    const status = stage === 'Done' ? 'Completed' : stage === 'In Review' ? 'Pending Review' : stage === 'In Progress' ? 'Working' : 'Open';
    const patch = (rows: TaskRow[]) => rows.map((r) => (r.name === name ? { ...r, status } : r));
    set((s) => ({ day: s.day ? { ...s.day, tasks: patch(s.day.tasks) } : s.day, backlog: patch(s.backlog) }));
    try {
      await call('board.set_stage', { doctype: 'Task', name, stage });
      return stage;
    } catch {
      set(before);
      return null;
    }
  },
}));

export function stageOf(t: TaskRow): Stage {
  return TASK_STAGE[t.status] ?? 'Todo';
}

export function isOverdue(t: TaskRow, today: string): boolean {
  return !!t.exp_end_date && t.exp_end_date < today && stageOf(t) !== 'Done';
}
