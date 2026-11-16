import {
  emails,
  getConsole,
  getList,
  healthKind,
  type Console,
  type ConsoleProject,
  type HealthKind,
} from '@/features/pm/pm-api';
import { loadPeople } from '@/features/detail/api';

export type ProjectDoc = {
  name: string;
  project_name: string | null;
  custom_project_scope: string | null;
  status: string | null;
  expected_start_date: string | null;
  expected_end_date: string | null;
  percent_complete: number | null;
};

export type ProjectCard = {
  name: string;
  label: string;
  scope: string;
  status: string;
  open: number;
  overdue: number;
  done: number;
  total: number;
  waiting: number;
  lastChange: string | null;
  nextDue: string | null;
  health: HealthKind;
  reason: string;
  people: string[];
  start: string | null;
  end: string | null;
};

export const PROJECT_FIELDS = ['name', 'project_name', 'custom_project_scope', 'status', 'expected_start_date', 'expected_end_date', 'percent_complete'];

/** Full names for emails, from the assignable-users list (best effort). */
export async function nameMap(): Promise<Record<string, string>> {
  const m: Record<string, string> = {};
  try {
    (await loadPeople()).forEach((p) => (m[p.name] = p.full_name || p.name));
  } catch {
    // Names fall back to the email prefix.
  }
  return m;
}

export const shortName = (names: Record<string, string>, email: string) => names[email] ?? email.split('@')[0];

function card(c: ConsoleProject, doc: ProjectDoc | undefined, today: string, waiting: number, people: string[]): ProjectCard {
  return {
    name: c.project,
    label: c.label,
    scope: doc?.custom_project_scope || '',
    status: doc?.status || '',
    open: c.open,
    overdue: c.overdue,
    done: c.done,
    total: c.open + c.done,
    waiting,
    lastChange: c.last_change,
    nextDue: c.next_due,
    health: healthKind(c.health, c.open, c.last_change, today),
    reason: c.health.reason,
    people,
    start: doc?.expected_start_date ?? null,
    end: doc?.expected_end_date ?? null,
  };
}

export async function loadProjects(): Promise<{ cards: ProjectCard[]; today: string }> {
  const [con, docs, tasks, reqs, names] = await Promise.all([
    getConsole(30),
    getList<ProjectDoc>('Project', PROJECT_FIELDS, [['Project', 'project_type', '=', 'Dev Tools']]),
    getList<{ project: string; _assign: string | null }>('Task', ['project', '_assign'], [
      ['Task', 'is_group', '=', 0],
      ['Task', 'status', 'not in', ['Completed', 'Cancelled', 'Template']],
    ]).catch(() => []),
    getList<{ project: string | null }>('Request', ['project'], [['Request', 'workflow_state', 'in', ['Under Review', '']]]).catch(() => []),
    nameMap(),
  ]);
  const team: Record<string, Map<string, number>> = {};
  tasks.forEach((t) => {
    if (!t.project) return;
    const m = (team[t.project] ??= new Map());
    emails(t._assign).forEach((e) => m.set(e, (m.get(e) ?? 0) + 1));
  });
  const waiting: Record<string, number> = {};
  reqs.forEach((r) => r.project && (waiting[r.project] = (waiting[r.project] ?? 0) + 1));
  const byName = new Map(docs.map((d) => [d.name, d]));
  const cards = (con as Console).projects.map((c) =>
    card(
      c,
      byName.get(c.project),
      con.today,
      waiting[c.project] ?? 0,
      [...(team[c.project] ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]).map(([e]) => shortName(names, e)),
    ),
  );
  return { cards, today: con.today };
}
