import { useCallback, useState } from 'react';
import { api } from '@/core/api/client';
import { call } from '@/core/api/call';
import { useLoad } from '@/features/shared/useLoad';

type Doc = Record<string, unknown>;
export type Person = { name: string; full_name: string };

const get = async <T>(method: string, params: Record<string, unknown>) =>
  (await api<{ message: T }>({ method: 'GET', url: `/api/method/${method}`, params })).message;

const getDoc = (doctype: string, name: string) => get<Doc>('frappe.client.get', { doctype, name });
const getList = <T>(doctype: string, fields: string[], filters: unknown[]) =>
  get<T[]>('frappe.client.get_list', {
    doctype,
    fields: JSON.stringify(fields),
    filters: JSON.stringify(filters),
    limit_page_length: 50,
  });
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
const settle = async <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

/** Every enabled person who can be assigned work. One fetch per session. */
let peoplePromise: Promise<Person[]> | null = null;
export function loadPeople(force = false): Promise<Person[]> {
  if (!peoplePromise || force) {
    peoplePromise = call<Person[]>('requests.get_assignable_users', {}, true).catch((e) => {
      peoplePromise = null;
      throw e;
    });
  }
  return peoplePromise;
}

export type Link = { name: string; label: string; status?: string };

export type TaskDetail = {
  name: string;
  subject: string;
  status: string;
  priority: string;
  project: string;
  projectName: string;
  module: string;
  tags: string[];
  start: string;
  due: string;
  created: string;
  modified: string;
  completedOn: string;
  description: string;
  expectedHours: number;
  progress: number;
  assignees: string[];
  assigneeNames: Record<string, string>;
  request: Link | null;
  parent: Link | null;
  dependsOn: Link[];
  subTasks: Link[];
};

const parseJsonList = (v: unknown): string[] => {
  try {
    const x = JSON.parse(str(v) || '[]');
    return Array.isArray(x) ? x.filter((i) => typeof i === 'string') : [];
  } catch {
    return [];
  }
};

export async function loadTask(name: string): Promise<TaskDetail> {
  const t = await getDoc('Task', name);
  const project = str(t.project);
  const parent = str(t.parent_task);
  const requestName = str(t.custom_request);
  const depNames = ((t.depends_on as Doc[] | undefined) ?? []).map((d) => str(d.task)).filter(Boolean);
  const assignees = parseJsonList(t._assign);
  const [projectName, parentRow, request, deps, subs, people] = await Promise.all([
    project ? settle(get<Doc>('frappe.client.get_value', { doctype: 'Project', filters: JSON.stringify({ name: project }), fieldname: 'project_name' }).then((r) => str(r?.project_name)), '') : '',
    parent ? settle(getList<{ name: string; subject: string; status: string }>('Task', ['name', 'subject', 'status'], [['name', '=', parent]]), []) : [],
    requestName ? settle(getList<{ name: string; title: string; workflow_state: string }>('Request', ['name', 'title', 'workflow_state'], [['name', '=', requestName]]), []) : [],
    depNames.length ? settle(getList<{ name: string; subject: string; status: string }>('Task', ['name', 'subject', 'status'], [['name', 'in', depNames]]), []) : [],
    settle(getList<{ name: string; subject: string; status: string }>('Task', ['name', 'subject', 'status'], [['parent_task', '=', name]]), []),
    assignees.length ? settle(loadPeople(), [] as Person[]) : [],
  ]);
  const names: Record<string, string> = {};
  for (const p of people) names[p.name] = p.full_name || p.name;
  const link = (r: { name: string; subject: string; status: string }): Link => ({ name: r.name, label: r.subject, status: r.status });
  return {
    name,
    subject: str(t.subject) || name,
    status: str(t.status),
    priority: str(t.priority),
    project,
    projectName: projectName || project,
    module: str(t.custom_module),
    tags: str(t._user_tags).split(',').map((x) => x.trim()).filter(Boolean),
    start: str(t.exp_start_date).slice(0, 10),
    due: str(t.exp_end_date).slice(0, 10),
    created: str(t.creation),
    modified: str(t.modified),
    completedOn: str(t.completed_on),
    description: str(t.description),
    expectedHours: num(t.expected_time),
    progress: num(t.progress),
    assignees,
    assigneeNames: names,
    request: request[0] ? { name: request[0].name, label: request[0].title, status: request[0].workflow_state } : requestName ? { name: requestName, label: requestName } : null,
    parent: parentRow[0] ? link(parentRow[0]) : parent ? { name: parent, label: parent } : null,
    dependsOn: deps.map(link),
    subTasks: subs.map(link),
  };
}

export type HistoryEvent = { kind: string; at: string; text: string; by?: string | null };

/** The v2 request detail, which carries the server's own `can_*` flags. */
export type RequestDetail = {
  name: string;
  title: string;
  requestType: string;
  state: string;
  priority: string;
  project: string;
  projectName: string;
  raisedBy: string;
  raisedFor: string;
  raisedAt: string;
  modified: string;
  tags: string[];
  descriptionHtml: string;
  resolutionNotes: string;
  decisionReason: string;
  source: string;
  assignees: string[];
  task: { name: string; subject: string; status: string; due?: string | null } | null;
  events: HistoryEvent[];
  isOpen: boolean;
  canEdit: boolean;
  canWithdraw: boolean;
  canConfirm: boolean;
  /** False when only the bare record could be read (no v2 detail for this user). */
  full: boolean;
};

export async function loadRequest(name: string): Promise<RequestDetail> {
  const [v2, doc] = await Promise.all([
    call<Doc>('v2.requests.get_request_detail', { name }, true).catch((e): Doc => ({ success: false, error: e })),
    getDoc('Request', name).catch((e) => e as unknown),
  ]);
  const d = doc instanceof Error || !doc || typeof doc !== 'object' ? null : (doc as Doc);
  if (v2.success !== true && !d) {
    // Neither read worked: surface the real failure.
    if (doc instanceof Error) throw doc;
    if (v2.error instanceof Error) throw v2.error;
    throw new Error(str(v2.error) || 'Could not load this request.');
  }
  const ok = v2.success === true;
  const x = ok ? v2 : {};
  const task = (x.task as Doc | null) ?? null;
  const state = str(x.workflow_state) || str(d?.workflow_state);
  const htmlDesc = str(d?.description) || str(x.description_raw) || str(x.description);
  return {
    name,
    title: str(x.title) || str(d?.title) || name,
    requestType: str(x.request_type) || str(d?.request_type),
    state,
    priority: str(x.priority) || str(d?.priority),
    project: str(x.project) || str(d?.project),
    projectName: str(x.project_name) || str(x.project) || str(d?.project),
    raisedBy: str(x.raised_by) || str(d?.owner),
    raisedFor: str(x.raised_for),
    raisedAt: str(x.raised_at) || str(d?.creation),
    modified: str(d?.modified),
    tags: Array.isArray(x.tags) ? (x.tags as string[]) : str(d?._user_tags).split(',').map((t) => t.trim()).filter(Boolean),
    descriptionHtml: htmlDesc,
    resolutionNotes: str(x.resolution_notes) || str(d?.resolution_notes),
    decisionReason: str(x.decision_reason),
    source: str(x.source) || str(d?.source),
    assignees: Array.isArray(x.assignees) ? (x.assignees as string[]) : [],
    task: task ? { name: str(task.name), subject: str(task.subject), status: str(task.status), due: str(task.due) || null } : str(d?.linked_task) ? { name: str(d?.linked_task), subject: str(d?.linked_task), status: '' } : null,
    events: Array.isArray(x.events) ? (x.events as Doc[]).map((e) => ({ kind: str(e.kind), at: str(e.at), text: str(e.text), by: str(e.by) || null })) : [],
    isOpen: x.is_open === true,
    canEdit: x.can_edit === true,
    canWithdraw: x.can_withdraw === true,
    canConfirm: x.can_confirm === true,
    full: ok && x.full_detail === true,
  };
}

/** Latest-wins loader whose data can be patched optimistically (and rolled back by patching again). */
export function useDetail<T extends object>(fn: () => Promise<T>) {
  const { data, loading, error, reload } = useLoad(fn);
  const [p, setP] = useState<{ base: T | null; values: Partial<T> }>({ base: null, values: {} });
  const view = data ? (p.base === data ? { ...data, ...p.values } : data) : null;
  const patch = useCallback(
    (values: Partial<T>) => setP((prev) => ({ base: data, values: { ...(prev.base === data ? prev.values : {}), ...values } })),
    [data],
  );
  return { data: view, loading, error, reload, patch };
}
