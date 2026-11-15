import { create } from 'zustand';
import { call } from '@/core/api/call';
import { mapAxiosError } from '@/core/api/client';
import { TASK_STAGE, type Meeting, type Stage, type TaskRow } from '@/features/shared/types';

/** `requests.get_my_backlog`: every open task assigned to me, soonest deadline first. */
export type MyBacklog = {
  tasks: TaskRow[];
  meetings: Meeting[];
  requests: { name: string; title: string; request_type: string; workflow_state: string; priority?: string | null }[];
  progress: { completed_this_week: number; completed_prev_week: number };
};

type State = {
  data: MyBacklog | null;
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  /** Optimistic: flips the row first and rolls back if the server refuses. Returns the new stage on success. */
  moveTask: (name: string, stage: Stage) => Promise<Stage | null>;
};

let seq = 0;

const STATUS: Record<Stage, string> = {
  Triage: 'Open',
  Todo: 'Open',
  'In Progress': 'Working',
  'In Review': 'Pending Review',
  Blocked: 'Pending Review',
  Done: 'Completed',
};

export const useMyDay = create<State>((set, get) => ({
  data: null,
  loading: false,
  error: null,

  load: async () => {
    const mine = ++seq; // latest-wins: a slow older response never overwrites a newer one
    set({ loading: true, error: null });
    try {
      const data = await call<MyBacklog>('requests.get_my_backlog', {}, true);
      if (mine === seq) set({ data, loading: false });
    } catch (e) {
      if (mine === seq) set({ loading: false, error: mapAxiosError(e).message });
    }
  },

  moveTask: async (name, stage) => {
    const before = get().data;
    if (before) {
      const status = STATUS[stage];
      set({
        data: {
          ...before,
          // A closed task leaves the open list; the weekly count goes up with it.
          tasks: stage === 'Done' ? before.tasks.filter((t) => t.name !== name) : before.tasks.map((t) => (t.name === name ? { ...t, status } : t)),
          progress:
            stage === 'Done'
              ? { ...before.progress, completed_this_week: before.progress.completed_this_week + 1 }
              : before.progress,
        },
      });
    }
    try {
      await call('board.set_stage', { doctype: 'Task', name, stage });
      return stage;
    } catch {
      set({ data: before });
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

/** What belongs on today's plate: due today or earlier, or already being worked on. */
export function isToday(t: TaskRow, today: string): boolean {
  return stageOf(t) === 'In Progress' || (!!t.exp_end_date && t.exp_end_date <= today);
}
