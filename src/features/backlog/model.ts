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

export type DueParam = 'overdue' | 'today' | 'tomorrow' | 'week' | 'thisweek' | 'review';

/** Whose work the Work tab shows: mine, anything assigned to someone, or everything (including unassigned and requests). */
export type Scope = 'mine' | 'team' | 'all';
export type GroupBy = 'due' | 'project' | 'assignee' | 'priority' | 'stage';

export const SCOPES: { value: Scope; label: string }[] = [
  { value: 'mine', label: 'Mine' },
  { value: 'team', label: 'Team' },
  { value: 'all', label: 'All' },
];
export const GROUPS: { value: GroupBy; label: string }[] = [
  { value: 'due', label: 'Due date' },
  { value: 'project', label: 'Project' },
  { value: 'assignee', label: 'Assignee' },
  { value: 'priority', label: 'Priority' },
  { value: 'stage', label: 'Stage' },
];

/** Quick narrowing on top of scope and filters, set by stat tiles, saved views and deep links. */
export type Lens = { due?: string; unassigned?: boolean };
export const NO_LENS: Lens = {};

export const DUE_LABEL: Record<string, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  tomorrow: 'Due tomorrow',
  week: 'Later this week',
  thisweek: 'Due this week',
  review: 'In review',
};

type Ctx = { search: string; filters: Filters; email: string | null; scope: Scope; lens: Lens; includeDone: boolean };

/** Every filter in one place. `includeDone` is true for the board (which has a Done column) and when the Done stage is chosen. */
export function applyFilters(all: Item[], c: Ctx): Item[] {
  const { filters: f } = c;
  const q = c.search.trim().toLowerCase();
  const today = todayKey();
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
  const weekEnd = format(addDays(new Date(), 6), 'yyyy-MM-dd');
  const mine = f.mine || c.scope === 'mine';
  const { due } = c.lens;
  return all.filter((i) => {
    if (q && !i.title.toLowerCase().includes(q) && !i.name.toLowerCase().includes(q)) return false;
    if (mine && !(i.assignee_ids ?? []).includes(c.email ?? '')) return false;
    if (c.scope === 'team' && !f.mine && !(i.assignee_ids ?? []).length) return false;
    if (c.lens.unassigned && ((i.assignee_ids ?? []).length || i.doctype === 'Request')) return false;
    if (f.priorities.length && !f.priorities.includes(i.priority ?? 'None')) return false;
    if (f.types.length && !f.types.includes(i.doctype)) return false;
    if (f.projects.length && !f.projects.includes(i.project ?? '')) return false;
    if (f.modules.length && !f.modules.includes(i.module ?? '')) return false;
    if (f.tags.length && !(i.tags ?? []).some((t) => f.tags.includes(t))) return false;
    if (f.stages.length) {
      if (!f.stages.includes(i.stage)) return false;
    } else if (!c.includeDone && i.stage === 'Done') return false;
    if (due) {
      if (i.stage === 'Done') return false;
      if (due === 'overdue') return !!i.late;
      if (due === 'today') return i.end === today || i.stage === 'In Progress';
      if (due === 'tomorrow') return i.end === tomorrow;
      if (due === 'week') return !!i.end && i.end > tomorrow && i.end <= weekEnd;
      if (due === 'thisweek') return !!i.end && i.end >= today && i.end <= weekEnd;
      if (due === 'review') return i.stage === 'In Review';
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

export type SwipeTarget = { to: Stage; label: string; icon: 'checkmark-circle' | 'play' | 'arrow-undo'; color: string };

const GREEN = '#15803D';
const BLUE = '#2563EB';
const GREY = '#525252';

/** What swiping a row does. Right finishes it; left starts it (or sends an already-started item back). Requests do not swipe. */
export function swipeTargets(i: Item): { right?: SwipeTarget; left?: SwipeTarget } {
  if (i.doctype === 'Request') return {};
  const back = i.doctype === 'Issue' ? 'Triage' : 'Todo';
  const done: SwipeTarget = { to: 'Done', label: 'Done', icon: 'checkmark-circle', color: GREEN };
  const wip: SwipeTarget = { to: 'In Progress', label: 'In progress', icon: 'play', color: BLUE };
  const undo: SwipeTarget = { to: back, label: back === 'Todo' ? 'Back to todo' : 'Back to triage', icon: 'arrow-undo', color: GREY };
  if (i.stage === 'Done') return { left: { ...wip, label: 'Reopen' } };
  if (i.stage === 'In Progress') return { right: done, left: undo };
  return { right: done, left: wip };
}

export function selectable(i: Item): boolean {
  return i.doctype !== 'Request';
}

export type Group = { key: string; title: string; count: number; items: Item[]; hot?: boolean };

const PRIORITY_ORDER = ['Urgent', 'Critical', 'High', 'Medium', 'Low', 'None'];

/** Splits items into ordered groups for the list view. `name` resolves a project id to its title. */
export function groupItems(items: Item[], by: GroupBy, name: (i: Item) => string | undefined): Group[] {
  const map = new Map<string, Item[]>();
  const titles = new Map<string, string>();
  const put = (key: string, title: string, i: Item) => {
    if (!map.has(key)) {
      map.set(key, []);
      titles.set(key, title);
    }
    map.get(key)?.push(i);
  };
  for (const i of items) {
    if (by === 'due') {
      const b = bucketOf(i);
      put(b, BUCKETS.find((x) => x.key === b)?.label ?? b, i);
    } else if (by === 'project') put(i.project ?? '', i.project ? name(i) ?? i.project : 'No project', i);
    else if (by === 'assignee') {
      const names = i.assignees?.length ? i.assignees : i.assignee_ids ?? [];
      if (!names.length) put('', 'Unassigned', i);
      else for (const n of names) put(n, n, i);
    } else if (by === 'priority') put(i.priority || 'None', i.priority || 'No priority', i);
    else put(i.stage, i.stage, i);
  }
  const keys = [...map.keys()];
  if (by === 'due') keys.sort((a, b) => BUCKETS.findIndex((x) => x.key === a) - BUCKETS.findIndex((x) => x.key === b));
  else if (by === 'priority') keys.sort((a, b) => PRIORITY_ORDER.indexOf(a) - PRIORITY_ORDER.indexOf(b));
  else if (by === 'stage') keys.sort((a, b) => STAGE_ORDER.indexOf(a as Stage) - STAGE_ORDER.indexOf(b as Stage));
  else keys.sort((a, b) => (a === '' ? 1 : b === '' ? -1 : (titles.get(a) ?? '').localeCompare(titles.get(b) ?? '')));
  return keys.map((k) => ({
    key: by === 'due' ? k : `${by}:${k}`,
    title: titles.get(k) ?? k,
    count: map.get(k)?.length ?? 0,
    items: map.get(k) ?? [],
    hot: by === 'due' && k === 'overdue',
  }));
}

export type QuickView = { key: string; label: string; scope: Scope; lens: Lens; stages?: string[] };

export const QUICK_VIEWS: QuickView[] = [
  { key: 'today', label: 'Mine today', scope: 'mine', lens: { due: 'today' } },
  { key: 'overdue', label: 'Overdue', scope: 'mine', lens: { due: 'overdue' } },
  { key: 'unassigned', label: 'Unassigned', scope: 'all', lens: { unassigned: true } },
  { key: 'thisweek', label: 'Due this week', scope: 'mine', lens: { due: 'thisweek' } },
  { key: 'review', label: 'Needs review', scope: 'all', lens: { due: 'review' } },
  { key: 'closed', label: 'Recently closed', scope: 'mine', lens: {}, stages: ['Done'] },
];

export const sameLens = (a: Lens, b: Lens) => (a.due ?? '') === (b.due ?? '') && !!a.unassigned === !!b.unassigned;

export function isQuickViewActive(q: QuickView, scope: Scope, lens: Lens, f: Filters): boolean {
  const stagesOk = q.stages ? f.stages.length === q.stages.length && q.stages.every((x) => f.stages.includes(x)) : f.stages.length === 0;
  return q.scope === scope && sameLens(q.lens, lens) && stagesOk && filterCount({ ...f, stages: [] }) === 0;
}

export function dueChoices(): { label: string; value: string }[] {
  const d = (n: number) => format(addDays(new Date(), n), 'yyyy-MM-dd');
  const nextMon = (() => {
    const now = new Date();
    return format(addDays(now, ((8 - now.getDay()) % 7) || 7), 'yyyy-MM-dd');
  })();
  return [
    { label: 'Today', value: d(0) },
    { label: 'Tomorrow', value: d(1) },
    { label: 'In 3 days', value: d(3) },
    { label: 'Next Monday', value: nextMon },
    { label: 'In 2 weeks', value: d(14) },
  ];
}
