export type TaskRow = {
  name: string;
  subject: string;
  status: string;
  priority: string;
  project?: string | null;
  custom_request?: string | null;
  custom_planned_for?: string | null;
  exp_end_date?: string | null;
};

export type Meeting = {
  name: string;
  subject: string;
  starts_on: string;
  ends_on?: string | null;
  location?: string | null;
  google_meet_link?: string | null;
};

/** Board stages the API understands (see api/board.py STAGES). */
export type Stage = 'Triage' | 'Todo' | 'In Progress' | 'In Review' | 'Blocked' | 'Done';

export const TASK_STAGE: Record<string, Stage> = {
  Open: 'Todo',
  Template: 'Todo',
  Working: 'In Progress',
  Overdue: 'In Progress',
  'Pending Review': 'In Review',
  Completed: 'Done',
  Cancelled: 'Done',
};

export const NEXT_STAGE: Partial<Record<Stage, Stage>> = {
  Todo: 'In Progress',
  'In Progress': 'In Review',
  'In Review': 'Done',
};
