import { api } from '@/core/api/client';
import { call } from '@/core/api/call';

/** Shapes returned by upande_dev_tools.api.v2.pm_dashboard / api.portfolio (read from the server code). */

export type ConsoleTask = {
  kind: 'task';
  name: string;
  title: string;
  status: string;
  priority: string | null;
  project: string;
  project_label: string;
  area: string | null;
  assignee_ids: string[];
  assignees: string[];
  due: string | null;
  days_late: number;
  modified: string | null;
  quiet_days: number;
  request: string | null;
  actions: string[];
};
export type ConsoleRequest = {
  kind: 'request' | 'approved';
  name: string;
  title: string;
  type: string | null;
  area: string | null;
  priority: string | null;
  project: string | null;
  project_label: string | null;
  requester: string;
  created: string;
  age_days: number;
  actions: string[];
};
export type ConsoleIssue = {
  kind: 'issue';
  name: string;
  title: string;
  status: string;
  priority: string | null;
  project: string;
  project_label: string;
  assignees: string[];
  modified: string | null;
  quiet_days: number;
  actions: string[];
};
export type ConsoleItem = ConsoleTask | ConsoleRequest | ConsoleIssue;

export type Health = { level: 'good' | 'watch'; reason: string };
export type ConsolePerson = { user: string; name: string; open: number; overdue: number; due_soon: number; delivered: number; heavy: boolean };
export type ConsoleProject = {
  project: string;
  label: string;
  owner: string;
  open: number;
  overdue: number;
  done: number;
  next_due: string | null;
  last_change: string | null;
  health: Health;
};
export type Weekly = { week: string; raised: number; delivered: number };

export type Console = {
  today: string;
  days: number;
  decide: ConsoleRequest[];
  late: ConsoleTask[];
  no_owner: (ConsoleTask | ConsoleRequest)[];
  stuck: (ConsoleTask | ConsoleIssue)[];
  people: { rows: ConsolePerson[]; median_open: number | null };
  projects: ConsoleProject[];
  weekly: Weekly[];
  can_act: boolean;
  can_decide: boolean;
};

export type Kpi = {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  delta: number | null;
  direction: 'good' | 'bad' | 'flat';
  signed: boolean;
  note: string;
};
export type Portfolio = {
  period: { days: number; open: number; clears_in: number | null; clears_on: string | null; excluded: number };
  kpis: Kpi[];
  risks: { kind: string; name: string; title: string; days: number; who?: string[]; priority?: string }[];
  modules: { module: string; open: number; late: number; delivered: number; total: number; bug_share: number | null }[];
  ageing: { label: string; count: number }[];
  forecast:
    | { insufficient: true; note: string; open_total: number; history: ForecastPoint[] }
    | { insufficient: false; done: boolean; open_total: number; history: ForecastPoint[]; p50_weeks?: number; p85_weeks?: number; p50_date?: string; p85_date?: string; capped?: boolean };
  due_soon: { total: number; items: { name: string; subject: string; exp_end_date: string; who: string[] }[] };
  data_trust: { total_open: number; with_due_date: number; with_assignee: number; with_module: number };
  plan_vs_reality: { total: number; off_books: number; pct: number };
  pipeline: { funnel: { raised: number; accepted: number; delivered: number; rejected: number; deferred: number; still_deciding: number } };
  releases: { total: number; failure_rate: number; failed: number; week_labels: string[]; frequency: { instance: string; counts: number[]; total: number }[] };
};
export type ForecastPoint = { label: string; date: string; open: number; completed: number };

/** A Task as the PM screens read it straight from the list API (for ageing, areas, due lists). */
export type TaskRec = {
  name: string;
  subject: string;
  status: string;
  priority: string | null;
  project: string;
  exp_end_date: string | null;
  creation: string;
  modified: string;
  completed_on: string | null;
  custom_module: string | null;
  _assign: string | null;
};
export type RequestRec = {
  name: string;
  title: string;
  workflow_state: string | null;
  priority: string | null;
  project: string | null;
  product_area: string | null;
  creation: string;
  linked_task: string | null;
};

const get = async <T>(method: string, params: Record<string, unknown>) =>
  (await api<{ message: T }>({ method: 'GET', url: `/api/method/${method}`, params })).message;

export const getList = <T>(doctype: string, fields: string[], filters: unknown[], limit = 5000) =>
  get<T[]>('frappe.client.get_list', {
    doctype,
    fields: JSON.stringify(fields),
    filters: JSON.stringify(filters),
    limit_page_length: limit,
  });

export async function getConsole(days: number, project?: string): Promise<Console> {
  const r = await call<Console & { success: boolean; error?: string }>(
    'v2.pm_dashboard.get_pm_console',
    { days, ...(project ? { project } : {}) },
    true,
  );
  if (!r.success) throw new Error(r.error || 'Could not load the console.');
  return r;
}

export async function getPersonTasks(person: string, project?: string): Promise<ConsoleTask[]> {
  const r = await call<{ success: boolean; error?: string; rows: ConsoleTask[] }>(
    'v2.pm_dashboard.get_pm_person_tasks',
    { person, ...(project ? { project } : {}) },
    true,
  );
  if (!r.success) throw new Error(r.error || 'Could not load tasks.');
  return r.rows;
}

export const getPortfolio = (days: number) => call<Portfolio>('portfolio.get_portfolio', { days }, true);

export const TASK_FIELDS = ['name', 'subject', 'status', 'priority', 'project', 'exp_end_date', 'creation', 'modified', 'completed_on', 'custom_module', '_assign'];

/** Tasks of the given projects that count as work (no templates, groups or cancelled). */
export const getTasks = (projects: string[]) =>
  getList<TaskRec>('Task', TASK_FIELDS, [
    ['Task', 'project', 'in', projects],
    ['Task', 'is_group', '=', 0],
    ['Task', 'status', 'not in', ['Template', 'Cancelled']],
  ]);

/** Write calls: the same endpoints the web PM console uses. */
export const setDue = (name: string, date: string | null) =>
  call('board.set_field', { doctype: 'Task', name, field: 'end', value: date ?? '' });
export const reassign = (name: string, emails: string[]) =>
  call('requests.reassign_task', { name, assign_to: emails.join(',') });
export const setTaskStatus = (name: string, status: 'Completed' | 'Pending Review' | string) =>
  call('requests.update_task_status', { name, status });

// --- small pure helpers ---------------------------------------------------------------

export const isOpenStatus = (s: string) => s !== 'Completed' && s !== 'Cancelled' && s !== 'Template';
export const emails = (raw: string | null | undefined): string[] => {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
export const dayOf = (s: string | null | undefined) => (s ? s.slice(0, 10) : '');
export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(`${dayOf(b)}T00:00:00`).getTime() - new Date(`${dayOf(a)}T00:00:00`).getTime()) / 86400000);

export const AGE_BANDS: [string, number | null][] = [
  ['Under a week', 7],
  ['1 to 2 weeks', 14],
  ['2 to 4 weeks', 30],
  ['1 to 2 months', 60],
  ['2 to 6 months', 180],
  ['Over 6 months', null],
];
export const ageBand = (ageDays: number) => {
  const i = AGE_BANDS.findIndex(([, ceil]) => ceil === null || ageDays < ceil);
  return i < 0 ? AGE_BANDS.length - 1 : i;
};

export const median = (v: number[]) => {
  if (!v.length) return null;
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

export type HealthKind = 'good' | 'risk' | 'stalled';
/** Server rule: more than 20% overdue, or open work quiet for 14 days. Quiet wins when both apply. */
export function healthKind(h: Health, open: number, lastChange: string | null, today: string): HealthKind {
  if (h.level !== 'watch') return 'good';
  const quiet = lastChange ? daysBetween(lastChange, today) : 999;
  return open > 0 && quiet >= 14 ? 'stalled' : 'risk';
}
export const HEALTH_LABEL: Record<HealthKind, string> = { good: 'On track', risk: 'At risk', stalled: 'Stalled' };
