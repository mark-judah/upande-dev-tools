import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Row } from '@/core/ui/Row';
import { ProgressBar } from '@/core/ui/ProgressBar';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { Avatar } from '@/features/detail/parts';
import { ago } from '@/features/detail/format';
import { useLoad } from '@/features/shared/useLoad';
import { Pill } from '@/features/shared/Pill';
import {
  ageBand,
  AGE_BANDS,
  dayOf,
  daysBetween,
  emails,
  getConsole,
  getList,
  getTasks,
  healthKind,
  isOpenStatus,
  median,
  type Console,
  type RequestRec,
  type TaskRec,
} from '@/features/pm/pm-api';
import {
  ALARM,
  BarChart,
  ChipScroll,
  Empty,
  GREEN,
  GREY,
  HBars,
  HealthPill,
  Note,
  PageSkeleton,
  PMGate,
  SectionTitle,
  StackBar,
  Tile,
  TileGrid,
} from '@/features/pm/pm-ui';
import { DrillSheet, fromConsole, fromTask, PersonSheet, RowList, useRowActions, priorityTone, type ActionTarget, type RowModel } from '@/features/pm/work-rows';
import { nameMap, PROJECT_FIELDS, type ProjectDoc } from './projects-api';

type Tab = 'overview' | 'work' | 'team' | 'requests' | 'insights';
const TABS: { value: Tab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'work', label: 'Work' },
  { value: 'team', label: 'Team' },
  { value: 'requests', label: 'Requests' },
  { value: 'insights', label: 'Insights' },
];

type Data = { con: Console; doc: ProjectDoc | null; tasks: TaskRec[]; reqs: RequestRec[]; names: Record<string, string> };

async function load(name: string): Promise<Data> {
  const [con, docs, tasks, reqs, names] = await Promise.all([
    getConsole(30, name),
    getList<ProjectDoc>('Project', PROJECT_FIELDS, [['Project', 'name', '=', name]]),
    getTasks([name]),
    getList<RequestRec>('Request', ['name', 'title', 'workflow_state', 'priority', 'project', 'product_area', 'creation', 'linked_task'], [['Request', 'project', '=', name]]).catch(() => [] as RequestRec[]),
    nameMap(),
  ]);
  return { con, doc: docs[0] ?? null, tasks, reqs, names };
}

const nice = (d?: string | null) => (d ? format(parseISO(dayOf(d)), 'd MMM yyyy') : '');
const shortWeek = (d: string) => format(parseISO(d), 'd MMM');
const WAITING = new Set(['', 'Under Review']);
const FLIGHT = new Set(['Approved', 'Scheduled', 'In Progress']);

export function ProjectDetailScreen() {
  return (
    <PMGate title="Project">
      <Detail />
    </PMGate>
  );
}

function Detail() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const project = String(name);
  const { data, loading, error, reload } = useLoad(() => load(project));
  const [tab, setTab] = useState<Tab>('overview');
  const [drill, setDrill] = useState<string | null>(null);
  const [person, setPerson] = useState<{ user: string; name: string } | null>(null);
  const [weekSel, setWeekSel] = useState<number | null>(null);
  const [thruSel, setThruSel] = useState<number | null>(null);
  const { openActions, sheets } = useRowActions(reload);

  const d = useMemo(() => (data ? derive(data) : null), [data]);
  const lists = useMemo(() => (data && d ? buildLists(data, d) : {}), [data, d]);

  const title = data?.doc?.project_name || data?.con.projects[0]?.label || 'Project';

  return (
    <Screen title={title} backFallback="/projects" error={!data && !loading ? error : null} onRetry={reload} onRefresh={reload}>
      {!data || !d ? (
        <PageSkeleton />
      ) : (
        <View style={loading ? { opacity: 0.55 } : undefined}>
          <Header data={data} d={d} />
          <ChipScroll
            options={TABS.map((t) => ({
              ...t,
              label: t.value === 'requests' && data.reqs.length ? `Requests (${data.reqs.length})` : t.label,
            }))}
            value={tab}
            onChange={setTab}
          />

          {tab === 'overview' ? (
            <Overview data={data} d={d} setDrill={setDrill} thruSel={thruSel} setThruSel={setThruSel} />
          ) : null}

          {tab === 'work' ? <Work lists={lists} onActions={openActions} setDrill={setDrill} /> : null}

          {tab === 'team' ? (
            <>
              <SectionTitle>People on this project</SectionTitle>
              <Card>
                {data.con.people.rows.length === 0 ? <Empty title="Nobody holds open work here" /> : null}
                {data.con.people.rows.map((x, i, a) => {
                  const max = Math.max(1, ...a.map((y) => y.open));
                  return (
                    <Pressable
                      key={x.user}
                      onPress={() => setPerson({ user: x.user, name: x.name })}
                      accessibilityRole="button"
                      accessibilityLabel={`${x.name}: ${x.open} open, ${x.overdue} overdue. Open their tasks and reassign`}
                      style={({ pressed }) => [s.person, i < a.length - 1 && s.divider, pressed && { backgroundColor: COLORS.bgMuted }]}
                    >
                      <View style={s.personHead}>
                        <Avatar name={x.name} size={36} />
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={s.name} numberOfLines={1}>{x.name}</Text>
                          <Text style={s.muted}>
                            {x.open} open{x.overdue ? ` · ${x.overdue} overdue` : ''}{x.due_soon ? ` · ${x.due_soon} due in 7 days` : ''}
                          </Text>
                        </View>
                        {x.heavy ? <Pill label="Carrying a lot" tone="warn" /> : x.overdue >= 5 && x.overdue * 2 >= x.open ? <Pill label="Mostly late" tone="danger" /> : null}
                      </View>
                      <ProgressBar scale={1} value={x.open / max} exceeded={x.heavy} />
                    </Pressable>
                  );
                })}
                <Note>
                  Open and overdue tasks on this project only. Carrying a lot means more than twice the team median{data.con.people.median_open ? ` (${data.con.people.median_open})` : ''}. Tap someone to see their tasks, reassign them or set new dates.
                </Note>
              </Card>
              {d.unassigned > 0 ? (
                <Card onPress={() => setDrill('no_owner')} accessibilityLabel={`${d.unassigned} open tasks have no owner`}>
                  <Row title={`${d.unassigned} open tasks have no owner`} subtitle="Tap to assign them" divider={false} />
                </Card>
              ) : null}
            </>
          ) : null}

          {tab === 'requests' ? <RequestsTab reqs={data.reqs} today={data.con.today} /> : null}

          {tab === 'insights' ? (
            <Insights data={data} d={d} weekSel={weekSel} setWeekSel={setWeekSel} setDrill={setDrill} lists={lists} />
          ) : null}
        </View>
      )}

      <DrillSheet
        title={drill ? lists[drill]?.title ?? '' : null}
        subtitle={drill ? lists[drill]?.subtitle : undefined}
        rows={drill ? lists[drill]?.rows ?? [] : []}
        onClose={() => setDrill(null)}
        onChanged={reload}
      />
      <PersonSheet person={person} project={project} onClose={() => setPerson(null)} onChanged={reload} />
      {sheets}
    </Screen>
  );
}

// --- derived numbers ------------------------------------------------------------------

type Derived = ReturnType<typeof derive>;

function derive({ con, tasks, doc, reqs }: Data) {
  const today = con.today;
  const open = tasks.filter((t) => isOpenStatus(t.status));
  const done = tasks.filter((t) => t.status === 'Completed');
  const status = {
    open: open.filter((t) => t.status === 'Open' || t.status === 'Overdue').length,
    working: open.filter((t) => t.status === 'Working').length,
    pending: open.filter((t) => t.status === 'Pending Review').length,
    done: done.length,
  };
  const ageing = AGE_BANDS.map(([label], i) => ({ label, count: open.filter((t) => ageBand(daysBetween(t.creation, today)) === i).length }));
  const soonEnd = new Date(new Date(today).getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const soon = open.filter((t) => t.exp_end_date && dayOf(t.exp_end_date) >= today && dayOf(t.exp_end_date) <= soonEnd);
  const unassigned = open.filter((t) => emails(t._assign).length === 0).length;
  const leads = done.map((t) => daysBetween(t.creation, t.completed_on || t.modified)).filter((n) => n >= 0);
  const dated = done.filter((t) => t.exp_end_date);
  const onTime = dated.filter((t) => dayOf(t.completed_on || t.modified) <= dayOf(t.exp_end_date)).length;
  const areas = new Map<string, { open: number; late: number }>();
  open.forEach((t) => {
    const k = t.custom_module || 'No area';
    const a = areas.get(k) ?? { open: 0, late: 0 };
    a.open += 1;
    if (t.exp_end_date && dayOf(t.exp_end_date) < today) a.late += 1;
    areas.set(k, a);
  });
  const prio = ['Urgent', 'High', 'Medium', 'Low'].map((p) => ({ p, n: open.filter((t) => t.priority === p).length }));
  const withDue = open.filter((t) => t.exp_end_date).length;
  const meta = con.projects[0];
  const kind = meta ? healthKind(meta.health, meta.open, meta.last_change, today) : 'good';
  const waiting = reqs.filter((r) => WAITING.has(r.workflow_state ?? '')).length;
  return {
    today, open, done, status, ageing, soon, unassigned,
    leadMedian: median(leads), onTimePct: dated.length ? Math.round((onTime / dated.length) * 100) : null, datedCount: dated.length,
    areas: [...areas.entries()].sort((a, b) => b[1].open - a[1].open), prio, withDue, meta, kind, waiting,
    pct: tasks.length ? done.length / tasks.length : 0, total: tasks.length, planned: doc?.expected_start_date && doc?.expected_end_date ? [doc.expected_start_date, doc.expected_end_date] as const : null,
  };
}

function buildLists(data: Data, d: Derived) {
  const { con, names } = data;
  const today = d.today;
  const out: Record<string, { title: string; subtitle?: string; rows: RowModel[] }> = {};
  const byDue = (a: TaskRec, b: TaskRec) => (a.exp_end_date ?? '9999').localeCompare(b.exp_end_date ?? '9999');
  const rows = (list: TaskRec[]) => [...list].sort(byDue).map((t) => fromTask(t, names, today));
  out.late = { title: 'Overdue', subtitle: 'Most late first', rows: con.late.map(fromConsole) };
  out.no_owner = { title: 'No owner', rows: con.no_owner.map(fromConsole) };
  out.stuck = { title: 'Gone quiet', subtitle: 'In progress, unchanged for 14 days or more', rows: con.stuck.map(fromConsole) };
  out.soon = { title: 'Due in the next 7 days', rows: rows(d.soon) };
  out.open = { title: 'Open tasks', rows: rows(d.open) };
  out.done = { title: 'Done', subtitle: 'Most recent first', rows: [...d.done].sort((a, b) => dayOf(b.completed_on || b.modified).localeCompare(dayOf(a.completed_on || a.modified))).map((t) => fromTask(t, names, today)) };
  out.s_open = { title: 'Open', rows: rows(d.open.filter((t) => t.status === 'Open' || t.status === 'Overdue')) };
  out.s_working = { title: 'Working', rows: rows(d.open.filter((t) => t.status === 'Working')) };
  out.s_pending = { title: 'Pending review', rows: rows(d.open.filter((t) => t.status === 'Pending Review')) };
  out.s_done = out.done;
  AGE_BANDS.forEach(([label], i) => {
    out[`age:${i}`] = { title: `Open for ${label.toLowerCase()}`, rows: rows(d.open.filter((t) => ageBand(daysBetween(t.creation, today)) === i)) };
  });
  d.areas.forEach(([a]) => {
    out[`area:${a}`] = { title: a, subtitle: 'Open tasks in this area', rows: rows(d.open.filter((t) => (t.custom_module || 'No area') === a)) };
  });
  ['Urgent', 'High', 'Medium', 'Low'].forEach((p) => {
    out[`prio:${p}`] = { title: `${p} priority`, subtitle: 'Open tasks', rows: rows(d.open.filter((t) => t.priority === p)) };
  });
  return out;
}

// --- header ---------------------------------------------------------------------------

function Header({ data, d }: { data: Data; d: Derived }) {
  const { doc, con } = data;
  const m = d.meta;
  return (
    <View style={s.header}>
      <Text style={s.headName} numberOfLines={3}>{doc?.project_name || m?.label || 'Project'}</Text>
      <View style={s.pills}>
        <HealthPill kind={d.kind} />
        {doc?.custom_project_scope ? <Pill label={doc.custom_project_scope} /> : null}
        {doc?.status ? <Pill label={doc.status} /> : null}
      </View>
      {m?.health.reason ? <Text style={s.headReason}>{m.health.reason}</Text> : null}
      <View style={s.headProgress}>
        <View style={s.progressHead}>
          <Text style={s.headMuted}>{d.done.length} of {d.total} tasks done</Text>
          <Text style={s.headPct}>{Math.round(d.pct * 100)}%</Text>
        </View>
        <ProgressBar scale={1} value={d.pct} height={8} trackColor="#14532D" fillColor="#86EFAC" />
      </View>
      <View style={s.dates}>
        <HeadFact label="Planned" value={doc?.expected_start_date || doc?.expected_end_date ? `${nice(doc.expected_start_date) || '?'} to ${nice(doc.expected_end_date) || '?'}` : 'No dates set'} />
        <HeadFact label="Next due" value={m?.next_due ? nice(m.next_due) : 'Nothing dated'} />
        <HeadFact label="Last activity" value={m?.last_change ? ago(`${m.last_change} 12:00:00`) : 'None'} />
        <HeadFact label="As of" value={nice(con.today)} />
      </View>
    </View>
  );
}

const HeadFact = ({ label, value }: { label: string; value: string }) => (
  <View style={s.fact}>
    <Text style={s.factLabel}>{label.toUpperCase()}</Text>
    <Text style={s.factValue} numberOfLines={2}>{value}</Text>
  </View>
);

// --- tabs -----------------------------------------------------------------------------

function Overview({ data, d, setDrill, thruSel, setThruSel }: {
  data: Data;
  d: Derived;
  setDrill: (k: string) => void;
  thruSel: number | null;
  setThruSel: (i: number | null) => void;
}) {
  const { con } = data;
  const weekly = con.weekly;
  const elapsed = d.planned
    ? Math.max(0, Math.min(1, daysBetween(d.planned[0], d.today) / Math.max(1, daysBetween(d.planned[0], d.planned[1]))))
    : null;
  return (
    <>
      <TileGrid>
        <Tile label="Open" value={d.open.length} sub="tasks not yet done" onPress={() => setDrill('open')} />
        <Tile label="Overdue" value={con.late.length} sub="past their due date" tone={con.late.length ? 'alarm' : 'dark'} subColor={con.late.length ? '#FCA5A5' : undefined} onPress={() => setDrill('late')} />
        <Tile label="Due in 7 days" value={d.soon.length} sub="coming up" onPress={() => setDrill('soon')} />
        <Tile label="No owner" value={d.unassigned} sub="nobody assigned" onPress={() => setDrill('no_owner')} />
        <Tile label="Done" value={d.done.length} sub="all time" tone="green" onPress={() => setDrill('done')} />
        <Tile label="Requests waiting" value={d.waiting} sub="for a decision" onPress={() => router.push('/review-queue' as never)} />
      </TileGrid>

      <Card title="Where the work stands">
        <StackBar
          onPress={(k) => setDrill(`s_${k}`)}
          segments={[
            { key: 'open', label: 'Open', value: d.status.open, color: GREY },
            { key: 'working', label: 'Working', value: d.status.working, color: '#171717' },
            { key: 'pending', label: 'Pending review', value: d.status.pending, color: '#92400E' },
            { key: 'done', label: 'Done', value: d.status.done, color: '#22C55E' },
          ]}
        />
        <Note>Every task on this project by status. Tap a segment to list it.</Note>
      </Card>

      <Card title="How long work has been open">
        <HBars
          rows={d.ageing.map((a, i) => ({ key: `age:${i}`, label: a.label, value: a.count, color: i >= 4 ? ALARM : i >= 3 ? '#92400E' : '#171717' }))}
          onPress={setDrill}
        />
        <Note>Age counts from the day each open task was created.</Note>
      </Card>

      <Card title="Completed per week">
        <BarChart
          data={weekly.map((w) => ({ label: shortWeek(w.week), a: w.delivered }))}
          aColor="#171717"
          selected={thruSel}
          onSelect={(i) => setThruSel(thruSel === i ? null : i)}
        />
        <Text style={s.caption}>
          {thruSel != null
            ? `Week of ${shortWeek(weekly[thruSel].week)}: ${weekly[thruSel].delivered} completed`
            : `${weekly.reduce((a, w) => a + w.delivered, 0)} completed in 12 weeks. Tap a week to read it.`}
        </Text>
        <Note>Throughput: how many tasks reached Completed each week. A steady line is a predictable team.</Note>
      </Card>

      <Card title="Plan vs reality">
        {elapsed != null ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={s.muted}>Time used: {Math.round(elapsed * 100)}% of the planned window</Text>
            <ProgressBar scale={1} value={elapsed} height={8} />
            <Text style={s.muted}>Work done: {Math.round(d.pct * 100)}% of tasks</Text>
            <ProgressBar scale={1} value={d.pct} height={8} exceeded={d.pct + 0.1 < elapsed} />
            <Note>
              {d.pct + 0.1 < elapsed
                ? 'Work is behind the calendar. Either the dates need moving or the team needs help.'
                : 'Work is keeping pace with the calendar.'}
            </Note>
          </View>
        ) : (
          <>
            <Text style={s.muted}>No planned start and end dates are set on this project, so progress cannot be compared with a plan.</Text>
            <Note>{d.withDue} of {d.open.length} open tasks have a due date, which is the part of the plan that does exist.</Note>
          </>
        )}
      </Card>
    </>
  );
}

function Work({ lists, onActions, setDrill }: {
  lists: Record<string, { title: string; rows: RowModel[] }>;
  onActions: (t: ActionTarget) => void;
  setDrill: (k: string) => void;
}) {
  const sections: { key: string; title: string; note: string }[] = [
    { key: 'late', title: 'Overdue', note: 'Most late first.' },
    { key: 'soon', title: 'Due in the next 7 days', note: 'Not late yet.' },
    { key: 'no_owner', title: 'No owner', note: 'Open tasks nobody holds.' },
    { key: 'stuck', title: 'Gone quiet', note: 'In progress with no change for 14 days.' },
  ];
  const any = sections.some((x) => lists[x.key]?.rows.length);
  return (
    <>
      {!any ? <Card><Empty title="Nothing needs attention" body="No overdue, due-soon, ownerless or quiet tasks." /></Card> : null}
      {sections.map((x) =>
        lists[x.key]?.rows.length ? (
          <View key={x.key}>
            <SectionTitle action={lists[x.key].rows.length > 5 ? { label: `All ${lists[x.key].rows.length}`, onPress: () => setDrill(x.key) } : undefined}>
              {`${x.title} (${lists[x.key].rows.length})`}
            </SectionTitle>
            <Card>
              <RowList rows={lists[x.key].rows} onActions={onActions} limit={5} />
              <Note>{x.note}</Note>
            </Card>
          </View>
        ) : null,
      )}
    </>
  );
}

function RequestsTab({ reqs, today }: { reqs: RequestRec[]; today: string }) {
  const rowOf = (r: RequestRec): RowModel => ({
    key: r.name,
    kind: 'request',
    name: r.name,
    title: r.title,
    sub: `${r.workflow_state || 'Under Review'} · ${r.product_area || 'No area'} · ${daysBetween(r.creation, today)}d old`,
    pill: r.priority ? { label: r.priority, tone: priorityTone(r.priority) } : undefined,
  });
  const waiting = reqs.filter((r) => WAITING.has(r.workflow_state ?? ''));
  const flight = reqs.filter((r) => FLIGHT.has(r.workflow_state ?? ''));
  const finished = reqs.filter((r) => !WAITING.has(r.workflow_state ?? '') && !FLIGHT.has(r.workflow_state ?? ''));
  if (!reqs.length) return <Card><Empty title="No requests" body="Nobody has raised a request against this project." /></Card>;
  return (
    <>
      <SectionTitle>{`Waiting for a decision (${waiting.length})`}</SectionTitle>
      <Card>
        <RowList rows={waiting.map(rowOf)} empty="Every request has an answer" limit={6} />
      </Card>
      <SectionTitle>{`In flight (${flight.length})`}</SectionTitle>
      <Card>
        <RowList rows={flight.map(rowOf)} empty="Nothing approved and underway" limit={6} />
        <Note>Approved, scheduled or being built.</Note>
      </Card>
      <SectionTitle>{`Finished (${finished.length})`}</SectionTitle>
      <Card>
        <RowList rows={finished.map(rowOf)} empty="Nothing finished yet" limit={4} />
        <Note>Completed, closed, rejected, deferred or withdrawn.</Note>
      </Card>
    </>
  );
}

function Insights({ data, d, weekSel, setWeekSel, setDrill, lists }: {
  data: Data;
  d: Derived;
  weekSel: number | null;
  setWeekSel: (i: number | null) => void;
  setDrill: (k: string) => void;
  lists: Record<string, { title: string; rows: RowModel[] }>;
}) {
  const { con } = data;
  const weekly = con.weekly;
  const risks = useMemo(() => {
    const weight: Record<string, number> = { Urgent: 4, High: 2, Medium: 1, Low: 0.5 };
    return [...con.late]
      .sort((a, b) => b.days_late * (weight[b.priority ?? ''] ?? 1) - a.days_late * (weight[a.priority ?? ''] ?? 1))
      .slice(0, 5)
      .map(fromConsole);
  }, [con.late]);
  return (
    <>
      <TileGrid>
        <Tile label="Lead time" value={d.leadMedian == null ? '–' : `${Math.round(d.leadMedian)}d`} sub={d.leadMedian == null ? 'No finished tasks yet' : 'median days from raised to done'} />
        <Tile label="Finished on time" value={d.onTimePct == null ? '–' : `${d.onTimePct}%`} sub={d.onTimePct == null ? 'No finished task had a due date' : `of ${d.datedCount} finished tasks that had a due date`} />
      </TileGrid>

      <Card title="Raised vs completed, 12 weeks">
        <View style={s.legend}>
          <View style={s.legendItem}><View style={[s.dot, { backgroundColor: GREY }]} /><Text style={s.muted}>Raised</Text></View>
          <View style={s.legendItem}><View style={[s.dot, { backgroundColor: '#171717' }]} /><Text style={s.muted}>Completed</Text></View>
        </View>
        <BarChart
          data={weekly.map((w) => ({ label: shortWeek(w.week), a: w.raised, b: w.delivered }))}
          selected={weekSel}
          onSelect={(i) => setWeekSel(weekSel === i ? null : i)}
          height={130}
        />
        <Text style={s.caption}>
          {weekSel != null ? `Week of ${shortWeek(weekly[weekSel].week)}: ${weekly[weekSel].raised} raised, ${weekly[weekSel].delivered} completed` : 'Tap a week to read it.'}
        </Text>
        <Note>When the dark bars stay below the pale ones, work is arriving faster than it is finished.</Note>
      </Card>

      <Card title="Open work by priority">
        <HBars rows={d.prio.map((x) => ({ key: `prio:${x.p}`, label: x.p, value: x.n, color: x.p === 'Urgent' ? ALARM : '#171717' }))} onPress={(k) => lists[k] && setDrill(k)} />
      </Card>

      {d.areas.length ? (
        <Card title="Open work by area">
          <HBars
            rows={d.areas.slice(0, 8).map(([a, v]) => ({ key: `area:${a}`, label: a, value: v.open, sub: v.late ? `${v.late} late` : undefined, color: v.late > v.open / 2 ? ALARM : '#171717' }))}
            onPress={(k) => lists[k] && setDrill(k)}
          />
          <Note>Where the open tasks sit, with how many are late. Tap an area to list its tasks.</Note>
        </Card>
      ) : null}

      <SectionTitle>Biggest risks</SectionTitle>
      <Card>
        <RowList rows={risks} empty="Nothing is overdue" limit={5} />
        <Note>The most overdue tasks, weighted by priority.</Note>
      </Card>

      <Card title="How much to trust these numbers">
        <HBars
          max={100}
          rows={[
            { key: 'due', label: 'Open tasks with a due date', value: d.open.length ? Math.round((d.withDue / d.open.length) * 100) : 0, unit: '%' },
            { key: 'who', label: 'Open tasks with an owner', value: d.open.length ? Math.round(((d.open.length - d.unassigned) / d.open.length) * 100) : 0, unit: '%' },
          ]}
        />
        <Note>Overdue and on-time figures only cover tasks that have a due date.</Note>
      </Card>
    </>
  );
}

const s = StyleSheet.create({
  header: { backgroundColor: GREEN, borderRadius: borderRadius.xl, padding: spacing.lg, marginBottom: spacing.md, gap: spacing.sm },
  headName: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: '#FFFFFF' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  headReason: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: '#BBF7D0', lineHeight: 19 },
  headProgress: { gap: 6, marginTop: spacing.xs },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between' },
  headMuted: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: '#BBF7D0' },
  headPct: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: '#FFFFFF' },
  dates: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  fact: { flexBasis: '45%', flexGrow: 1, gap: 2 },
  factLabel: { fontFamily: fontFamily.medium, fontSize: 10, letterSpacing: 0.6, color: '#86EFAC' },
  factValue: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: '#FFFFFF' },
  caption: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text, marginTop: spacing.sm },
  legend: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  person: { gap: spacing.sm, paddingVertical: spacing.md, minHeight: 64 },
  personHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  name: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, lineHeight: 18 },
});
