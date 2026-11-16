import { addDays, format, isValid, parseISO } from 'date-fns';

export type ViewKey = 'waiting' | 'approved' | 'deferred' | 'scheduled';
export type TabKey = ViewKey | 'decided';
export type Quick = 'all' | 'stale' | 'mine';
export type AgeBand = 'fresh' | 'few' | 'week' | 'fortnight';
export type RowAction = 'accept' | 'approve' | 'defer' | 'reject' | 'schedule' | 'reopen' | 'reassign';

export type QueueRow = {
  name: string;
  title: string;
  request_type: string;
  priority: string;
  status: string;
  product_area: string;
  project: string;
  project_name: string;
  raised_by: string;
  raised_by_name: string;
  raised_for: string;
  requested_for: string;
  requested_for_name: string;
  tags: string[];
  creation: string;
  age_days: number;
  age_label: string;
  age_band: AgeBand;
  stage_since: string;
  task: string;
  due: string;
  assignees: string[];
  assignee_ids: string[];
  actions: RowAction[];
};

export type QueueResponse = {
  success: boolean;
  view: ViewKey;
  counts: Record<ViewKey, number>;
  rows: QueueRow[];
  can_decide: boolean;
  truncated: boolean;
};

export type QueueOptions = {
  decision_priorities: string[];
  tags: string[];
  projects: { value: string; label: string }[];
};

export type Person = { name: string; full_name: string };

export type HistoryEvent = { at: string; kind: string; title: string; by_name: string; text: string };

export type Detail = {
  success: boolean;
  error?: string;
  request?: { description: string };
  history?: HistoryEvent[];
};

export const VIEWS: ViewKey[] = ['waiting', 'approved', 'deferred', 'scheduled'];

export const TAB_LABEL: Record<TabKey, string> = {
  waiting: 'Waiting',
  approved: 'Approved',
  deferred: 'Deferred',
  scheduled: 'Scheduled',
  decided: 'Decided this week',
};

export const BAND_TONE: Record<AgeBand, { bg: string; fg: string }> = {
  fresh: { bg: '#F0FDF4', fg: '#166534' },
  few: { bg: '#F5F5F5', fg: '#525252' },
  week: { bg: '#FFFBEB', fg: '#92400E' },
  fortnight: { bg: '#FEF2F2', fg: '#991B1B' },
};

export const ACCEPT_GREEN = '#16A34A';
export const DEFER_AMBER = '#D97706';
export const REJECT_RED = '#DC2626';

export const DEFER_REASONS = [
  'Not a priority now',
  'Needs more information',
  'Blocked by other work',
  'Out of scope this quarter',
  'Waiting on the customer',
];
export const REJECT_REASONS = ['Duplicate', 'Out of scope', 'Not a real issue', 'Already fixed', 'Won’t do'];

export const DATE_CHIPS = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'In a week', days: 7 },
  { label: 'In 2 weeks', days: 14 },
] as const;

export const dateIn = (days: number) => format(addDays(new Date(), days), 'yyyy-MM-dd');

/** True for a real calendar date written yyyy-mm-dd. */
export function validDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && isValid(parseISO(v));
}

export function plain(html?: string | null): string {
  return (html ?? '')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function waitingText(r: QueueRow): string {
  if (r.status !== 'Under Review') return r.age_label === 'Today' ? 'Raised today' : `Raised ${r.age_label} ago`;
  return r.age_days <= 0 ? 'Waiting since today' : `Waiting ${r.age_label}`;
}

/** Decided in the last 7 days, from when the request entered its current state. */
export function decidedThisWeek(r: QueueRow, now: Date = new Date()): boolean {
  if (!r.stage_since) return false;
  const d = parseISO(r.stage_since.replace(' ', 'T'));
  return isValid(d) && now.getTime() - d.getTime() < 7 * 86400000;
}
