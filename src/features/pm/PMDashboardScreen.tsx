import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { ProgressBar } from '@/core/ui/ProgressBar';
import { Skeleton } from '@/core/ui/Skeleton';
import { call } from '@/core/api/call';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { useLoad } from '@/features/shared/useLoad';
import { Pill } from '@/features/shared/Pill';

type Kpi = { key: string; label: string; value: number | null; unit: string; delta: number | null; direction: 'good' | 'bad' | 'flat'; signed: boolean; note: string };
type Win = { name: string; subject: string; completed_on: string; by: string[] };
type Risk = { kind: string; name: string; title: string; days: number; who?: string[] };
type Portfolio = {
  period: { days: number; open: number; clears_in: number | null; clears_on: string | null };
  kpis: Kpi[];
  wins: Win[];
  risks: Risk[];
};
type Dev = { user: string; name: string; open: number; working: number; overdue: number; delivered: number; over_capacity?: boolean };
type Project = { name: string; project_name: string; custom_project_scope?: string; total: number; done: number; overdue: number; requests: number };
type All = { portfolio: Portfolio; people: Dev[]; projects: Project[] };

const load = async (): Promise<All> => {
  const portfolio = await call<Portfolio & { people?: Dev[]; projects?: Project[] }>('portfolio.get_portfolio', { days: 30 }, true);
  return { portfolio, people: portfolio.people ?? [], projects: portfolio.projects ?? [] };
};

const fmt = (k: Kpi) => {
  if (k.value == null) return '–';
  const sign = k.signed && k.value > 0 ? '+' : '';
  return `${sign}${k.value}${k.unit}`;
};
const deltaText = (k: Kpi) => (k.delta ? `${k.delta > 0 ? '▲' : '▼'} ${Math.abs(k.delta)}${k.unit} vs prior` : '');
const isAlarm = (k: Kpi) => k.key === 'risk' && (k.value ?? 0) > 0;

export function PMDashboardScreen() {
  const { data, loading, error, reload } = useLoad(load);
  const p = data?.portfolio;

  return (
    <Screen title="PM Dashboard" loading={false} error={!data && !loading ? error : null} onRetry={reload} onRefresh={reload}>
      {!data ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={110} />
          <Skeleton height={90} />
          <Skeleton height={160} />
        </View>
      ) : (
        <>
          <View style={s.hero}>
            <Text style={s.heroChip}>PORTFOLIO · LAST {p?.period.days} DAYS</Text>
            <Text style={s.heroNum}>{p?.period.open ?? 0}</Text>
            <Text style={s.heroSub}>
              open tasks
              {p?.period.clears_in != null ? ` · clears in ~${p.period.clears_in} days at current pace` : ''}
            </Text>
          </View>

          <View style={s.grid}>
            {(p?.kpis ?? []).map((k) => {
              const alarm = isAlarm(k);
              return (
                <View key={k.key} style={[s.tile, alarm && s.tileAlarm]}>
                  <Text style={s.chip}>{k.label.toUpperCase()}</Text>
                  <Text style={s.tileNum}>{fmt(k)}</Text>
                  {deltaText(k) ? (
                    <Text style={[s.delta, { color: k.direction === 'bad' ? '#FCA5A5' : k.direction === 'good' ? '#86EFAC' : '#A3A3A3' }]}>
                      {deltaText(k)}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>

          <Card title="Risks">
            {(p?.risks ?? []).length === 0 ? <Text style={s.muted}>Nothing at risk. </Text> : null}
            {(p?.risks ?? []).map((r) => (
              <View key={`${r.kind}-${r.name}`} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={2}>{r.title}</Text>
                  <Text style={s.muted}>{r.name}{r.who?.length ? ` · ${r.who.join(', ')}` : ''}</Text>
                </View>
                <Pill label={`${r.kind} · ${r.days}d`} tone={r.kind === 'Past due' ? 'danger' : 'warn'} />
              </View>
            ))}
          </Card>

          <Card title="Recent wins">
            {(p?.wins ?? []).length === 0 ? <Text style={s.muted}>No completed tasks in this period.</Text> : null}
            {(p?.wins ?? []).map((w) => (
              <View key={w.name} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={2}>{w.subject}</Text>
                  <Text style={s.muted}>{w.by.join(', ') || 'Unassigned'} · {w.completed_on}</Text>
                </View>
                <Pill label="Done" tone="success" />
              </View>
            ))}
          </Card>

          <Card title="Team workload">
            {data.people.length === 0 ? <Text style={s.muted}>No open tasks.</Text> : null}
            {data.people.map((d) => {
              const max = Math.max(1, ...data.people.map((x) => x.open));
              return (
                <View key={d.user} style={s.dev}>
                  <View style={s.between}>
                    <Text style={s.name}>{d.name}</Text>
                    <Text style={s.muted}>
                      {d.open} open{d.working ? ` · ${d.working} working` : ''}
                      {d.overdue ? ` · ${d.overdue} overdue` : ''}
                    </Text>
                  </View>
                  <ProgressBar scale={1} value={d.open / max} exceeded={!!d.over_capacity} />
                </View>
              );
            })}
          </Card>

          <Card title={`Projects (${data.projects.length})`}>
            {data.projects.map((pr) => {
              const pct = pr.total ? pr.done / pr.total : 0;
              return (
                <View key={pr.name} style={s.dev}>
                  <View style={s.between}>
                    <Text style={[s.name, { flex: 1 }]} numberOfLines={1}>{pr.project_name}</Text>
                    {pr.custom_project_scope ? <Pill label={pr.custom_project_scope} /> : null}
                  </View>
                  <ProgressBar scale={1} value={pct} />
                  <Text style={s.muted}>
                    {pr.done}/{pr.total} done · {pr.requests} open requests
                    {pr.overdue ? ` · ${pr.overdue} overdue` : ''}
                  </Text>
                </View>
              );
            })}
          </Card>
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { backgroundColor: '#052E16', borderRadius: 24, padding: spacing.lg, marginBottom: spacing.md, gap: 4 },
  heroChip: { fontFamily: fontFamily.medium, fontSize: 10, letterSpacing: 0.6, color: '#86EFAC' },
  heroNum: { fontFamily: fontFamily.bold, fontSize: 34, color: '#FFFFFF' },
  heroSub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: '#BBF7D0' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  tile: { backgroundColor: '#171717', borderRadius: 16, padding: spacing.md, width: '48.5%', gap: 2 },
  tileAlarm: { backgroundColor: '#7F1D1D' },
  chip: { fontFamily: fontFamily.medium, fontSize: 10, letterSpacing: 0.6, color: '#A3A3A3' },
  tileNum: { fontFamily: fontFamily.bold, fontSize: 34, color: '#FFFFFF' },
  delta: { fontFamily: fontFamily.medium, fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  dev: { gap: 6, paddingVertical: spacing.sm },
  name: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
});
