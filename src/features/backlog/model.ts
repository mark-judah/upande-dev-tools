import { addDays, format } from 'date-fns';
import { relativeDue, todayKey } from '@/core/date';
import type { Stage } from '@/features/shared/types';

export type Kind = 'Task' | 'Issue' | 'Request';

export type Item = {
  doctype: Kind;
  name: string;
  title: string;
  status?: string;
  stage: Stage;
  rank?: number;
  priority?: string | null;
  project?: string | null;
  module?: string | null;
  start?: string | null;
  end?: string | null;
  movable?: boolean;
  tags?: string[];
  assignee_ids?: string[];
  assignees?: string[];
  late?: boolean;
};

export type Board = { items: Item[]; total: number; stages: Stage[] };

export type ViewMode = 'list' | 'board' | 'calendar';

export type Filters = {
  mine: boolean;
  priorities: string[];
  stages: string[];
  types: string[];
  projects: string[];
  tags: string[];
  modules: string[];
};

export const EMPTY_FILTERS: Filters = { mine: false, priorities: [], stages: [], types: [], projects: [], tags: [], modules: [] };

export const itemKey = (i: Item) => `${i.doctype}-${i.name}`;

export function filterCount(f: Filters): number {
  return (f.mine ? 1 : 0) + f.priorities.length + f.stages.length + f.types.length + f.projects.length + f.tags.length + f.modules.length;
}

export type DueParam = 'overdue' | 'today' | 'tomorrow' | 'week' | 'review';

export const DUE_LABEL: Record<string, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  tomorrow: 'Due tomorrow',
  week: 'Later this week',
  review: 'In review',
};

type Ctx = { search: string; filters: Filters; email: string | null; due?: string; mineParam?: boolean; includeDone: boolean };

/** Every filter in one place. `includeDone` is true for the board (which has a Done column) and when the Done stage is chosen. */
export function applyFilters(all: Item[], c: Ctx): Item[] {
  const { filters: f } = c;
  const q = c.search.trim().toLowerCase();
  const today = todayKey();
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  const weekEnd = format(addDays(new Date(), 6), 'yyyy-MM-dd');
  const mine = f.mine || !!c.mineParam;
  return all.filter((i) => {
    if (q && !i.title.toLowerCase().includes(q) && !i.name.toLowerCase().includes(q)) return false;
    if (mine && !(i.assignee_ids ?? []).includes(c.email ?? '')) return false;
    if (f.priorities.length && !f.priorities.includes(i.priority ?? 'None')) return false;
    if (f.types.length && !f.types.includes(i.doctype)) return false;
    if (f.projects.length && !f.projects.includes(i.project ?? '')) return false;
    if (f.modules.length && !f.modules.includes(i.module ?? '')) return false;
    if (f.tags.length && !(i.tags ?? []).some((t) => f.tags.includes(t))) return false;
    if (f.stages.length) {
      if (!f.stages.includes(i.stage)) return false;
    } else if (!c.includeDone && i.stage === 'Done') return false;
    if (c.due) {
      if (i.stage === 'Done') return false;
      if (c.due === 'overdue') return !!i.late;
      if (c.due === 'today') return i.end === today || i.stage === 'In Progress';
      if (c.due === 'tomorrow') return i.end === tomorrow;
      if (c.due === 'week') return !!i.end && i.end > tomorrow && i.end <= weekEnd;
      if (c.due === 'review') return i.stage === 'In Review';
    }
    return true;
  });
}

export type Bucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'none' | 'done';

export const BUCKETS: { key: Bucket; label: string }[] = [
  { key: 'overdue', label: 'Overdue' },
  { key: 'today', label: 'Today' },
  { key: 'tomorrow', label: 'Tomorrow' },
  { key: 'week', label: 'This week' },
  { key: 'later', label: 'Later' },
  { key: 'none', label: 'No date' },
  { key: 'done', label: 'Done' },
];

export function bucketOf(i: Item): Bucket {
  if (i.stage === 'Done') return 'done';
  const d = relativeDue(i.end);
  if (d.days == null) return 'none';
  if (d.days < 0) return 'overdue';
  if (d.days === 0) return 'today';
  if (d.days === 1) return 'tomorrow';
  if (d.days < 7) return 'week';
  return 'later';
}

export function priorityColor(p?: string | null): string {
  switch (p) {
    case 'Urgent':
    case 'Critical':
      return '#EF4444';
    case 'High':
      return '#F59E0B';
    case 'Medium':
      return '#737373';
    case 'Low':
      return '#D4D4D4';
    default:
      return 'transparent';
  }
}

export const initials = (name: string) =>
  name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

export const STAGE_ORDER: Stage[] = ['Triage', 'Todo', 'In Progress', 'In Review', 'Blocked', 'Done'];
export const PRIORITIES = ['Urgent', 'High', 'Medium', 'Low', 'None'];

/** Stages a card can be moved to. Tasks have no Blocked status of their own (the server folds it into In Review). */
export function moveTargets(i: Item): Stage[] {
  if (i.doctype === 'Task') return ['Todo', 'In Progress', 'In Review', 'Done'];
  if (i.doctype === 'Issue') return ['Triage', 'In Progress', 'Blocked', 'Done'];
  return [];
}
