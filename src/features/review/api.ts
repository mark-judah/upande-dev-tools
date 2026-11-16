import { call } from '@/core/api/call';
import type { Detail, Person, QueueOptions, QueueResponse, ViewKey } from './model';
import { VIEWS } from './model';

export type Desc = { name: string; description?: string | null };

export type QueueData = {
  views: Record<ViewKey, QueueResponse>;
  descriptions: Record<string, string>;
};

/** All four views at once, so tab counts, tiles and the duplicate check agree. */
export async function loadQueue(): Promise<QueueData> {
  const [responses, descs] = await Promise.all([
    Promise.all(VIEWS.map((view) => call<QueueResponse>('v2.review_queue.get_review_queue', { view }, true))),
    call<Desc[]>('requests.get_my_requests', {}, true).catch(() => [] as Desc[]),
  ]);
  const views = {} as Record<ViewKey, QueueResponse>;
  VIEWS.forEach((v, i) => {
    views[v] = responses[i];
  });
  const descriptions: Record<string, string> = {};
  for (const d of descs) if (d.description) descriptions[d.name] = d.description;
  return { views, descriptions };
}

export const loadOptions = () => call<QueueOptions & { success: boolean }>('v2.review_queue.get_review_queue_options', {}, true);

export const loadPeople = () => call<Person[]>('requests.get_assignable_users', {}, true);

export const loadProjects = () => call<{ name: string; project_name: string }[]>('board.get_projects', {}, true);

export const loadDetail = (name: string) => call<Detail>('v2.review_queue.get_request_detail', { name }, true);

export type AcceptArgs = {
  name: string;
  project: string;
  priority: string;
  complete_by: string;
  assign_to: string[];
  comment?: string;
  /** Only sent when the reviewer changed them; update_request refuses an empty list. */
  tags?: string[];
};

/** Approve and schedule in one step (creates the Task and assigns it). */
export async function acceptRequest(a: AcceptArgs) {
  if (a.tags?.length) await call('requests.update_request', { name: a.name, tags: a.tags });
  return call('requests.accept_request', {
    name: a.name,
    project: a.project,
    priority: a.priority,
    complete_by: a.complete_by,
    assign_to: a.assign_to,
    comment: a.comment || undefined,
  });
}

/** Approved -> Scheduled (creates the Task), then hands it to the chosen people. */
export async function scheduleRequest(a: AcceptArgs) {
  const doc = await call<{ linked_task?: string }>('requests.promote_to_task', { name: a.name });
  if (doc.linked_task) {
    await call('requests.reassign_task', {
      name: doc.linked_task,
      assign_to: a.assign_to,
      complete_by: a.complete_by,
      comment: a.comment || undefined,
    });
  }
  return doc;
}

export const reassignTask = (task: string, assign_to: string[], complete_by: string, comment?: string) =>
  call('requests.reassign_task', { name: task, assign_to, complete_by, comment: comment || undefined });

/** Defer / Reject need a reason; the server stores it as a Comment on the Request. */
export const triage = (name: string, action: 'Defer' | 'Reject' | 'Reopen' | 'Approve', reason?: string) =>
  call('requests.triage_request', { name, action, reason: reason || undefined });
