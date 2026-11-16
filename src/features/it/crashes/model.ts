import { formatDistanceToNowStrict } from 'date-fns';
import { itMobile, mobileApi, post } from '../shared/it-api';
import { COLORS } from '@/core/theme';

export type IssueStatus = 'Open' | 'Resolved' | 'Ignored';
export type IssueKind = 'crash' | 'error' | 'api' | 'log';

export type Problem = {
  name: string;
  app: string;
  title: string;
  culprit: string;
  kind: IssueKind;
  level: string;
  people: number;
  devices: number;
  times: number;
  last_seen: string;
  first_seen: string;
  status: IssueStatus;
  version: string;
  first_version: string;
  fixed_in: string;
};

export type ProblemsResult = {
  rows: Problem[];
  total: number;
  by_status: Partial<Record<IssueStatus, number>>;
  by_kind: Partial<Record<IssueKind, number>>;
};

export type LogEvent = {
  id: string;
  ts: string;
  app: string;
  kind: string;
  level: string;
  user: string;
  person: string;
  title: string;
  message: string;
  screen: string;
  version: string;
  device: string;
  platform: string;
  request: string;
  fatal: boolean;
  issue: string;
  stack?: string;
};

export type ErrorLogResult = {
  rows: LogEvent[];
  shown: number;
  hidden_count: number;
  more: boolean;
  page: number;
  people: { user: string; name: string; count: number }[];
};

export type PersonHit = { user: string; name: string; times: number; last: string };

export type Latest = {
  message?: string;
  error_name?: string;
  stack?: string;
  ts?: string;
  app_version?: string;
  screen?: string;
  platform?: string;
  os_version?: string;
  device_brand?: string;
  device_model?: string;
  user_full_name?: string;
  fatal?: number;
  request?: Record<string, unknown> | null;
  breadcrumbs?: { ts?: string; type?: string; message?: string }[] | null;
};

export type IssueBreakdown = {
  by_version: { label: string; n: number }[];
  by_model: { label: string; n: number }[];
};

export const fetchProblems = (args: { app?: string; status: IssueStatus | 'All'; kind?: IssueKind; search?: string; since?: string }) =>
  itMobile<ProblemsResult>('problems', args);

export const fetchApps = () => itMobile<{ rows: { app: string; problems: number }[] }>('apps');

export const fetchPeople = (name: string) => itMobile<{ rows: PersonHit[] }>('problem_people', { name });

export const fetchLatest = (name: string) => itMobile<{ latest: Latest | null }>('problem_event', { name });

export const fetchBreakdown = (name: string) => mobileApi<IssueBreakdown>('monitor.issue', { name, events: 1 });

export const fetchLog = (args: { app?: string; user?: string; kind?: string; page: number }) =>
  itMobile<ErrorLogResult>('error_log', { ...args, hide: '-' });

/** System Managers go through the developer API so the fixed-in version is recorded; everyone else uses the plain call. */
export function setStatus(name: string, status: IssueStatus, sm: boolean, version?: string) {
  if (sm) {
    return post.mobileApi('monitor.set_issue_status', {
      name,
      status,
      resolved_in_version: status === 'Resolved' && version ? version : undefined,
    });
  }
  return post.mobile('set_problem_status', { name, status });
}

/** Frappe sends 'YYYY-MM-DD HH:mm:ss.ffffff' (site time). Parse it as local time. */
export function parseTs(ts?: string | null): Date | null {
  if (!ts) return null;
  const d = new Date(ts.replace(' ', 'T').slice(0, 23));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function ago(ts?: string | null): string {
  const d = parseTs(ts);
  if (!d) return '';
  const secs = Math.abs(Date.now() - d.getTime()) / 1000;
  if (secs < 60) return 'just now';
  return `${formatDistanceToNowStrict(d)} ago`
    .replace(/ seconds?/, 's').replace(/ minutes?/, 'm').replace(/ hours?/, 'h')
    .replace(/ days?/, 'd').replace(/ months?/, 'mo').replace(/ years?/, 'y');
}

export const KIND_ICON: Record<string, string> = {
  crash: 'flame',
  error: 'bug',
  api: 'cloud-offline',
  log: 'document-text',
};

export const KIND_LABEL: Record<string, string> = { crash: 'Crash', error: 'Error', api: 'API', log: 'Log' };

export const STATUS_COLOR: Record<IssueStatus, string> = { Open: COLORS.danger, Resolved: COLORS.success, Ignored: '#9CA3AF' };

/** Severity from the kind and how many people it hurt: crashes and wide impact read hot. */
export function severity(p: Pick<Problem, 'kind' | 'people' | 'level' | 'status'>): { color: string; label: string } {
  if (p.status !== 'Open') return { color: '#D4D4D4', label: p.status };
  if (p.kind === 'crash' || p.level === 'fatal') return { color: '#B91C1C', label: 'Critical' };
  if (p.people >= 5) return { color: '#EF4444', label: 'Widespread' };
  if (p.people >= 2) return { color: COLORS.warn, label: 'Spreading' };
  return { color: '#A3A3A3', label: 'Minor' };
}
