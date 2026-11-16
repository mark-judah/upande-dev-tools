import { differenceInCalendarDays, differenceInHours, differenceInMinutes, format, parseISO } from 'date-fns';

export type RequestRow = {
  name: string;
  title: string;
  description?: string | null;
  request_type?: string | null;
  workflow_state: string;
  priority?: string | null;
  project?: string | null;
  linked_task?: string | null;
  owner: string;
  creation: string;
  tags?: string[];
  raised_by_name?: string;
  assignees?: string[];
};

export type StatusFilter = 'all' | 'open' | 'done' | 'closed';
export type Scope = 'mine' | 'all';
export type SortKey = 'newest' | 'priority';

/** The happy path, left to right. */
export const RAIL = ['Under Review', 'Approved', 'Scheduled', 'In Progress', 'Completed'] as const;

export const OPEN_STATES = ['Under Review', 'Approved', 'Scheduled', 'In Progress'];
export const DONE_STATES = ['Completed', 'Closed'];
export const CLOSED_STATES = ['Rejected', 'Deferred', 'Withdrawn'];
export const WITHDRAWABLE = ['Under Review', 'Approved', 'Deferred', 'Scheduled', 'In Progress'];

export type StateTone = { bg: string; fg: string };

export const STATE_TONE: Record<string, StateTone> = {
  'Under Review': { bg: '#FFFBEB', fg: '#92400E' },
  Approved: { bg: '#EEF2FF', fg: '#3730A3' },
  Scheduled: { bg: '#E0F2FE', fg: '#075985' },
  'In Progress': { bg: '#EDE9FE', fg: '#5B21B6' },
  Completed: { bg: '#F0FDF4', fg: '#166534' },
  Closed: { bg: '#F0FDF4', fg: '#166534' },
  Rejected: { bg: '#FEF2F2', fg: '#991B1B' },
  Deferred: { bg: '#F5F5F5', fg: '#525252' },
  Withdrawn: { bg: '#F5F5F5', fg: '#525252' },
};

export const toneFor = (state: string): StateTone => STATE_TONE[state] ?? { bg: '#F5F5F5', fg: '#525252' };

/** Index of the state on the rail; Closed counts as complete; off-rail states return -1. */
export function railIndex(state: string): number {
  if (state === 'Closed') return RAIL.length - 1;
  return RAIL.indexOf(state as (typeof RAIL)[number]);
}

export function matchesStatus(state: string, f: StatusFilter): boolean {
  if (f === 'open') return OPEN_STATES.includes(state);
  if (f === 'done') return DONE_STATES.includes(state);
  if (f === 'closed') return CLOSED_STATES.includes(state);
  return true;
}

const PRIORITY_RANK: Record<string, number> = { Urgent: 0, Critical: 0, High: 1, Medium: 2, Low: 3 };
export const priorityRank = (p?: string | null) => (p ? (PRIORITY_RANK[p] ?? 4) : 5);

/** "5m", "3h", "Yesterday", "4d", "12 Sep" from a Frappe datetime. */
export function age(creation: string, now: Date = new Date()): string {
  const d = parseISO(creation.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '';
  const mins = differenceInMinutes(now, d);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = differenceInHours(now, d);
  if (hrs < 24) return `${hrs}h ago`;
  const days = differenceInCalendarDays(now, d);
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days}d ago`;
  return format(d, d.getFullYear() === now.getFullYear() ? 'd MMM' : 'd MMM yyyy');
}

export function isThisMonth(creation: string, now: Date = new Date()): boolean {
  return creation.slice(0, 7) === format(now, 'yyyy-MM');
}

/** Mirrors the server's row_actions: the raiser may withdraw from these states. The server re-checks. */
export const canWithdraw = (r: RequestRow, email: string | null) =>
  !!email && r.owner.toLowerCase() === email.toLowerCase() && WITHDRAWABLE.includes(r.workflow_state);
