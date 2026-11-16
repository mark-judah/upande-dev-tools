import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { format, parseISO } from 'date-fns';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Row } from '@/core/ui/Row';
import { Button } from '@/core/ui/Button';
import { ProgressBar } from '@/core/ui/ProgressBar';
import { Segmented } from '@/core/ui/Segmented';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { Avatar } from '@/features/detail/parts';
import { useLoad } from '@/features/shared/useLoad';
import { Pill } from '@/features/shared/Pill';
import {
  ageBand,
  AGE_BANDS,
  daysBetween,
  getConsole,
  getPortfolio,
  getTasks,
  healthKind,
  isOpenStatus,
  type Console,
  type Kpi,
  type Portfolio,
  type TaskRec,
} from './pm-api';
import {
  ALARM,
  GREEN,
  GREY,
  HBars,
  HealthPill,
  KeyValue,
  Note,
  PageSkeleton,
  PMGate,
  SectionTitle,
  Tile,
  TileGrid,
  BarChart,
  Empty,
} from './pm-ui';
import { DrillSheet, fromConsole, fromTask, PersonSheet, RowList, useRowActions, type RowModel } from './work-rows';

type Data = { con: Console; pf: Portfolio; tasks: TaskRec[] };

async function load(days: number): Promise<Data> {
  const [con, pf] = await Promise.all([getConsole(days), getPortfolio(days)]);
  const tasks = await getTasks(con.projects.map((p) => p.project)).catch(() => [] as TaskRec[]);
  return { con, pf, tasks };
}

const PERIODS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
] as const;

const fmtKpi = (k: Kpi) => (k.value == null ? '–' : `${k.signed && k.value > 0 ? '+' : ''}${k.value}${k.unit}`);
const niceDate = (d?: string | null) => (d ? format(parseISO(d.slice(0, 10)), 'd MMM yyyy') : '');
const shortWeek = (d: string) => format(parseISO(d), 'd MMM');
const weeks = (n: number) => `${n} week${n === 1 ? '' : 's'}`;

export function PMDashboardScreen() {
  return (
    <PMGate title="PM Analysis">
      <Dashboard />
    </PMGate>
  );
}

function Dashboard() {
  const [days, setDays] = useState(30);
  const seen = useRef(30);
  const { data, loading, error, reload } = useLoad(() => load(days));
  useEffect(() => {
    if (seen.current === days) return;
    seen.current = days;
    reload();
  }, [days, reload]);

  const [drill, setDrill] = useState<string | null>(null);
  const [person, setPerson] = useState<{ user: string; name: string } | null>(null);
  const [weekSel, setWeekSel] = useState<number | null>(null);
  const [histSel, setHistSel] = useState<number | null>(null);
  const { openActions, sheets } = useRowActions(reload);

  const names = useMemo(() => {
    const m: Record<string, string> = {};
    data?.con.people.rows.forEach((p) => (m[p.user] = p.name));
    return m;
  }, [data]);

  const today = data?.con.today ?? '';
  const open = useMemo(() => (data?.tasks ?? []).filter((t) => isOpenStatus(t.status)), [data]);

  const lists = useMemo(() => {
    const out: Record<string, { title: string; subtitle?: string; rows: RowModel[] }> = {};
    if (!data) return out;
    const { con } = data;
    out.decide = { title: 'Waiting for a decision', subtitle: 'Requests under review, oldest first', rows: con.decide.map(fromConsole) };
    out.late = { title: 'Overdue', subtitle: 'Open tasks past their due date, most late first', rows: con.late.map(fromConsole) };
    out.no_owner = { title: 'No owner', subtitle: 'Open tasks nobody holds, and approved requests nobody scheduled', rows: con.no_owner.map(fromConsole) };
    out.stuck = { title: 'Gone quiet', subtitle: 'In progress with no change for 14 days or more, plus issues on hold', rows: con.stuck.map(fromConsole) };
    const byDue = (a: TaskRec, b: TaskRec) => (a.exp_end_date ?? '9999').localeCompare(b.exp_end_date ?? '9999');
    AGE_BANDS.forEach(([label], i) => {
      out[`age:${i}`] = {
        title: `Open for ${label.toLowerCase()}`,
        rows: open.filter((t) => ageBand(daysBetween(t.creation, today)) === i).sort(byDue).map((t) => fromTask(t, names, today)),
      };
    });
    const areas = new Set(open.map((t) => t.custom_module).filter(Boolean) as string[]);
    areas.forEach((a) => {
      out[`area:${a}`] = { title: a, subtitle: 'Open tasks in this area', rows: open.filter((t) => t.custom_module === a).sort(byDue).map((t) => fromTask(t, names, today)) };
    });
    const soonEnd = new Date(new Date(today).getTime() + 7 * 86400000).toISOString().slice(0, 10);
    out.soon = {
      title: 'Due in the next 7 days',
      rows: open.filter((t) => t.exp_end_date && t.exp_end_date.slice(0, 10) >= today && t.exp_end_date.slice(0, 10) <= soonEnd).sort(byDue).map((t) => fromTask(t, names, today)),
    };
    return out;
  }, [data, open, names, today]);

  const p = data?.pf;
  const con = data?.con;

  return (
    <Screen
      title="PM Analysis"
      error={!data && !loading ? error : null}
      onRetry={reload}
      onRefresh={reload}
    >
      {!data || !p || !con ? (
        <PageSkeleton />
      ) : (
        <View style={loading ? { opacity: 0.55 } : undefined}>
          <Segmented
            value={String(days) as '7' | '30' | '90'}
            options={PERIODS}
            onChange={(v) => {
              setDays(Number(v));
              setWeekSel(null);
            }}
          />

          <Hero p={p} />

          <SectionTitle>Needs you</SectionTitle>
          <TileGrid>
            <Tile label="Decide" value={con.decide.length} sub="requests waiting" onPress={() => setDrill('decide')} />
            <Tile label="Overdue" value={con.late.length} sub="tasks past due" tone={con.late.length ? 'alarm' : 'dark'} subColor={con.late.length ? '#FCA5A5' : undefined} onPress={() => setDrill('late')} />
            <Tile label="No owner" value={con.no_owner.length} sub="nobody assigned" onPress={() => setDrill('no_owner')} />
            <Tile label="Gone quiet" value={con.stuck.length} sub="no change in 14 days" onPress={() => setDrill('stuck')} />
          </TileGrid>
          <Note>Each tile opens the list behind it. Tap the dots on a row to reassign, set a new date, close it or move it to pending review.</Note>

          <SectionTitle>{`How we are doing, last ${days} days`}</SectionTitle>
          <TileGrid>
            {p.kpis
              .filter((k) => k.key !== 'waiting')
              .map((k) => (
                <Tile
                  key={k.key}
                  label={k.label}
                  value={fmtKpi(k)}
                  tone={k.key === 'risk' && (k.value ?? 0) > 0 ? 'alarm' : 'dark'}
                  sub={k.note}
                  onPress={k.key === 'risk' ? () => setDrill('late') : undefined}
                />
              ))}
          </TileGrid>

          <Card title="Delivered vs raised, 12 weeks">
            <Legend />
            <BarChart
              data={con.weekly.map((w) => ({ label: shortWeek(w.week), a: w.raised, b: w.delivered }))}
              selected={weekSel}
              onSelect={(i) => setWeekSel(weekSel === i ? null : i)}
              height={130}
            />
            <Text style={s.caption}>
              {weekSel != null
                ? `Week of ${shortWeek(con.weekly[weekSel].week)}: ${con.weekly[weekSel].raised} raised, ${con.weekly[weekSel].delivered} delivered`
                : `${con.weekly.reduce((a, w) => a + w.raised, 0)} raised and ${con.weekly.reduce((a, w) => a + w.delivered, 0)} delivered over 12 weeks. Tap a week to read it.`}
            </Text>
            <Note>Raised is tasks created that week, delivered is tasks completed. When the dark bars sit below the pale ones the backlog is growing.</Note>
          </Card>

          <Card title="How long work has been open">
            <HBars
              rows={p.ageing.map((a, i) => ({ key: `age:${i}`, label: a.label, value: a.count, color: i >= 4 ? ALARM : i >= 3 ? '#92400E' : '#171717' }))}
              onPress={(k) => setDrill(k)}
            />
            <Note>A big backlog is one thing, an old one is another. Tap a band to see which tasks are in it.</Note>
          </Card>

          <ForecastCard p={p} sel={histSel} onSel={setHistSel} />

          <SectionTitle>People</SectionTitle>
          <Card>
            {con.people.rows.length === 0 ? <Empty title="Nobody holds open work" /> : null}
            {con.people.rows.map((x, i, a) => {
              const max = Math.max(1, ...a.map((y) => y.open));
              return (
                <Pressable
                  key={x.user}
                  onPress={() => setPerson({ user: x.user, name: x.name })}
                  accessibilityRole="button"
                  accessibilityLabel={`${x.name}: ${x.open} open, ${x.overdue} overdue. Open their tasks`}
                  style={({ pressed }) => [s.person, i < a.length - 1 && s.divider, pressed && { backgroundColor: COLORS.bgMuted }]}
                >
                  <View style={s.personHead}>
                    <Avatar name={x.name} size={36} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={s.name} numberOfLines={1}>{x.name}</Text>
                      <Text style={s.muted} numberOfLines={2}>
                        {x.open} open{x.overdue ? ` · ${x.overdue} overdue` : ''}{x.due_soon ? ` · ${x.due_soon} due in 7 days` : ''} · {x.delivered} delivered
                      </Text>
                    </View>
                    {x.heavy ? <Pill label="Carrying a lot" tone="warn" /> : x.overdue >= 5 && x.overdue * 2 >= x.open ? <Pill label="Mostly late" tone="danger" /> : null}
                  </View>
                  <ProgressBar scale={1} value={x.open / max} exceeded={x.heavy} height={6} />
                </Pressable>
              );
            })}
            <Note>
              Carrying a lot means more than twice the team median{con.people.median_open ? ` (${con.people.median_open} open)` : ''}. A task shared by two people counts for both. Tap a person for their tasks.
            </Note>
          </Card>

          {p.modules.length ? (
            <Card title="Areas">
              <HBars
                rows={p.modules.slice(0, 8).map((m) => ({
                  key: `area:${m.module}`,
                  label: m.module,
                  value: m.open,
                  sub: m.late ? `${m.late} late` : undefined,
                  color: m.late > m.open ? ALARM : '#171717',
                }))}
                onPress={(k) => lists[k] && setDrill(k)}
              />
              <Note>Open tasks per product area, with how many are late. Tap an area to list its tasks.</Note>
            </Card>
          ) : null}

          <SectionTitle>Data you can trust</SectionTitle>
          <Card>
            <HBars
              max={100}
              rows={[
                { key: 'due', label: 'Have a due date', value: p.data_trust.with_due_date, unit: '%', color: p.data_trust.with_due_date < 50 ? '#92400E' : '#171717' },
                { key: 'who', label: 'Have an owner', value: p.data_trust.with_assignee, unit: '%', color: p.data_trust.with_assignee < 50 ? '#92400E' : '#171717' },
                { key: 'mod', label: 'Have an area', value: p.data_trust.with_module, unit: '%', color: p.data_trust.with_module < 50 ? '#92400E' : '#171717' },
              ]}
            />
            <Note>
              Of {p.data_trust.total_open} open tasks. On-time and overdue figures only describe the tasks with a due date, so read them with that share in mind.
              {p.period.excluded ? ` ${p.period.excluded} tasks with no project are left out of everything here.` : ''}
            </Note>
          </Card>

          {p.plan_vs_reality.total > 0 ? (
            <Card title="Plan vs reality">
              <Text style={s.big}>{p.plan_vs_reality.pct}%</Text>
              <Text style={s.muted}>{p.plan_vs_reality.off_books} of {p.plan_vs_reality.total} delivered tasks never came through a request</Text>
              <ProgressBar scale={1} value={p.plan_vs_reality.pct / 100} exceeded={p.plan_vs_reality.pct > 50} height={8} />
              <Note>Work that skipped intake was never triaged or prioritised by anyone before it was built.</Note>
            </Card>
          ) : null}

          {p.pipeline.funnel.raised > 0 ? (
            <Card title="Requests funnel">
              <HBars
                rows={[
                  { key: 'r', label: 'Raised', value: p.pipeline.funnel.raised },
                  { key: 'a', label: 'Accepted', value: p.pipeline.funnel.accepted },
                  { key: 'd', label: 'Delivered', value: p.pipeline.funnel.delivered },
                  { key: 's', label: 'Still deciding', value: p.pipeline.funnel.still_deciding, color: GREY },
                  { key: 'x', label: 'Rejected or deferred', value: p.pipeline.funnel.rejected + p.pipeline.funnel.deferred, color: GREY },
                ]}
              />
            </Card>
          ) : null}

          <SectionTitle>Releases</SectionTitle>
          <TileGrid>
            <Tile label="Deployments" value={p.releases.total} sub="all recorded" />
            <Tile
              label="Change failure"
              value={`${p.releases.failure_rate}%`}
              sub={`${p.releases.failed} of ${p.releases.total} failed or rolled back`}
              tone={p.releases.failed > 0 ? 'alarm' : 'dark'}
              subColor={p.releases.failed > 0 ? '#FCA5A5' : undefined}
              onPress={() => router.push('/deployments' as never)}
            />
          </TileGrid>
          {p.releases.frequency.length ? (
            <Card title="Releases per week">
              {p.releases.frequency.map((f) => (
                <View key={f.instance} style={{ marginBottom: spacing.md }}>
                  <Text style={s.name} numberOfLines={1}>{f.instance} <Text style={s.muted}>{f.total} total</Text></Text>
                  <BarChart data={f.counts.map((c, i) => ({ label: p.releases.week_labels[i] ?? '', a: c }))} height={44} aColor="#171717" />
                </View>
              ))}
              <Note>How often each instance was updated, last 8 weeks. Change failure rate is the share of releases that failed or were rolled back.</Note>
            </Card>
          ) : null}

          <SectionTitle>Biggest risks</SectionTitle>
          <Card>
            <RowList
              empty="Nothing at risk"
              rows={p.risks.slice(0, 6).map((r) => {
                const full = data.tasks.find((t) => t.name === r.name);
                const base = full ? fromTask(full, names, today) : null;
                return base
                  ? { ...base, pill: { label: `${r.days}d late`, tone: r.kind === 'Past due' ? 'danger' : 'warn' } }
                  : { key: r.name, kind: 'task' as const, name: r.name, title: r.title, sub: (r.who ?? []).join(', ') || 'Nobody', pill: { label: `${r.days}d late`, tone: 'danger' as const } };
              })}
              onActions={openActions}
            />
            <Button label={`See all ${con.late.length} overdue`} variant="outline" size="sm" onPress={() => setDrill('late')} style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }} />
            <Note>Ranked by how late each task is and how urgent it was marked.</Note>
          </Card>

          <SectionTitle>Due in the next 7 days</SectionTitle>
          <Card>
            <RowList
              empty="Nothing due this week"
              rows={(lists.soon?.rows ?? []).slice(0, 8)}
              onActions={openActions}
            />
            {p.due_soon.total > 5 ? (
              <Button label={`See all ${p.due_soon.total}`} variant="outline" size="sm" onPress={() => setDrill('soon')} style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }} />
            ) : null}
          </Card>

          <SectionTitle action={{ label: 'All projects', onPress: () => router.push('/projects' as never) }}>Projects</SectionTitle>
          <Card>
            {con.projects.length === 0 ? <Empty title="No projects" /> : null}
            {con.projects.map((pr, i, a) => (
              <Row
                key={pr.project}
                title={pr.label}
                subtitle={`${pr.open} open · ${pr.overdue} overdue · ${pr.done} done`}
                divider={i < a.length - 1}
                onPress={() => router.push(`/project/${pr.project}` as never)}
                right={<HealthPill kind={healthKind(pr.health, pr.open, pr.last_change, today)} />}
              />
            ))}
          </Card>
          <KeyValue label="As of" value={niceDate(today)} />
        </View>
      )}

      <DrillSheet
        title={drill ? lists[drill]?.title ?? '' : null}
        subtitle={drill ? lists[drill]?.subtitle : undefined}
        rows={drill ? lists[drill]?.rows ?? [] : []}
        onClose={() => setDrill(null)}
        onChanged={reload}
      />
      <PersonSheet person={person} onClose={() => setPerson(null)} onChanged={reload} />
      {sheets}
    </Screen>
  );
}

function Legend() {
  return (
    <View style={s.legend}>
      <View style={s.legendItem}><View style={[s.dot, { backgroundColor: GREY }]} /><Text style={s.muted}>Raised</Text></View>
      <View style={s.legendItem}><View style={[s.dot, { backgroundColor: '#171717' }]} /><Text style={s.muted}>Delivered</Text></View>
    </View>
  );
}

function Hero({ p }: { p: Portfolio }) {
  const f = p.forecast;
  const line =
    !f.insufficient && f.done
      ? 'Nothing open right now'
      : p.period.clears_in != null
        ? `At the last ${p.period.days} days' pace the pile clears in about ${p.period.clears_in} days`
        : 'Nothing finished lately, so there is no pace to forecast from yet';
  return (
    <View style={s.hero}>
      <Text style={s.heroChip}>PORTFOLIO · LAST {p.period.days} DAYS</Text>
      <Text style={s.heroNum}>{p.period.open}</Text>
      <Text style={s.heroSub}>open tasks</Text>
      <Text style={s.heroLine}>{line}</Text>
    </View>
  );
}

function ForecastCard({ p, sel, onSel }: { p: Portfolio; sel: number | null; onSel: (i: number | null) => void }) {
  const f = p.forecast;
  return (
    <Card title="When does the backlog clear?">
      {f.insufficient ? (
        <>
          <Text style={s.big}>No forecast yet</Text>
          <Text style={s.muted}>{f.note}</Text>
        </>
      ) : f.done ? (
        <Text style={s.big}>Nothing open</Text>
      ) : (
        <>
          <Text style={s.big}>~{weeks(f.p50_weeks ?? 0)}</Text>
          <Text style={s.muted}>
            Even odds by {niceDate(f.p50_date)}. 85% sure by {niceDate(f.p85_date)}{f.capped ? ' or later (the forecast stops at its limit)' : ''}.
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            <Pill label={`50%: ${weeks(f.p50_weeks ?? 0)}`} tone="info" />
            <Pill label={`85%: ${weeks(f.p85_weeks ?? 0)}`} tone="warn" />
          </View>
        </>
      )}
      <View style={{ height: spacing.md }} />
      <Text style={s.chartTitle}>Open tasks at the end of each week</Text>
      <BarChart
        data={f.history.map((h) => ({ label: h.label, a: h.open }))}
        selected={sel}
        onSelect={(i) => onSel(sel === i ? null : i)}
        aColor="#171717"
        height={90}
      />
      <Text style={s.caption}>
        {sel != null ? `Week ending ${f.history[sel].label}: ${f.history[sel].open} open, ${f.history[sel].completed} completed that week` : 'Tap a week to read it.'}
      </Text>
      <Note>
        The date comes from replaying your last 12 weeks of finished work thousands of times, so it is a range, not a promise. It counts every open task, late or undated.
      </Note>
    </Card>
  );
}

const s = StyleSheet.create({
  hero: { backgroundColor: GREEN, borderRadius: 24, padding: spacing.lg, marginBottom: spacing.md, gap: 2 },
  heroChip: { fontFamily: fontFamily.medium, fontSize: 10, letterSpacing: 0.6, color: '#86EFAC' },
  heroNum: { fontFamily: fontFamily.bold, fontSize: 44, color: '#FFFFFF', lineHeight: 52 },
  heroSub: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: '#BBF7D0' },
  heroLine: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: '#BBF7D0', marginTop: spacing.sm, lineHeight: 19 },
  caption: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text, marginTop: spacing.sm },
  chartTitle: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textSecondary, marginBottom: spacing.sm },
  legend: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  person: { gap: spacing.sm, paddingVertical: spacing.md, minHeight: 64 },
  personHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  name: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.xs + 1, color: COLORS.textMuted, lineHeight: 17 },
  big: { fontFamily: fontFamily.bold, fontSize: 28, color: COLORS.text, marginBottom: 2 },
});
