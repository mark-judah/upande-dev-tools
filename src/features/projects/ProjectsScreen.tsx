import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { ProgressBar } from '@/core/ui/ProgressBar';
import { Skeleton } from '@/core/ui/Skeleton';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { useLoad } from '@/features/shared/useLoad';
import { Pill } from '@/features/shared/Pill';
import { ago } from '@/features/detail/format';
import { Avatars, ChipScroll, Empty, HealthPill, PMGate } from '@/features/pm/pm-ui';
import { loadProjects, type ProjectCard } from './projects-api';

type Filter = 'all' | 'risk' | 'stalled' | 'good' | 'Internal' | 'External';
type Sort = 'health' | 'open' | 'overdue' | 'recent' | 'name';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'risk', label: 'At risk' },
  { value: 'stalled', label: 'Stalled' },
  { value: 'good', label: 'On track' },
  { value: 'Internal', label: 'Internal' },
  { value: 'External', label: 'External' },
];
const SORTS: { value: Sort; label: string }[] = [
  { value: 'health', label: 'At risk first' },
  { value: 'open', label: 'Most open' },
  { value: 'overdue', label: 'Most overdue' },
  { value: 'recent', label: 'Recent activity' },
  { value: 'name', label: 'A to Z' },
];
const RANK = { stalled: 0, risk: 1, good: 2 } as const;

export function ProjectsScreen() {
  return (
    <PMGate title="Projects">
      <Projects />
    </PMGate>
  );
}

function Projects() {
  const { data, loading, error, reload } = useLoad(loadProjects);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('health');
  const [q, setQ] = useState('');

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (data?.cards ?? []).filter(
      (c) =>
        (filter === 'all' || c.health === filter || c.scope === filter) &&
        (!needle || `${c.label} ${c.name}`.toLowerCase().includes(needle)),
    );
    const by: Record<Sort, (a: ProjectCard, b: ProjectCard) => number> = {
      health: (a, b) => RANK[a.health] - RANK[b.health] || b.open - a.open,
      open: (a, b) => b.open - a.open,
      overdue: (a, b) => b.overdue - a.overdue,
      recent: (a, b) => (b.lastChange ?? '').localeCompare(a.lastChange ?? ''),
      name: (a, b) => a.label.localeCompare(b.label),
    };
    return [...list].sort(by[sort]);
  }, [data, filter, sort, q]);

  const counts = useMemo(() => {
    const c = { risk: 0, stalled: 0, good: 0 };
    (data?.cards ?? []).forEach((x) => (c[x.health] += 1));
    return c;
  }, [data]);

  return (
    <Screen title="Projects" error={!data && !loading ? error : null} onRetry={reload} onRefresh={reload}>
      {!data ? (
        <View style={{ gap: spacing.md }} accessibilityLabel="Loading">
          <Skeleton height={48} radius={borderRadius.md} />
          <Skeleton height={190} radius={borderRadius.md} />
          <Skeleton height={190} radius={borderRadius.md} />
        </View>
      ) : (
        <View style={loading ? { opacity: 0.55 } : undefined}>
          <Text style={s.summary}>
            {data.cards.length} project{data.cards.length === 1 ? '' : 's'}: {counts.good} on track, {counts.risk} at risk, {counts.stalled} stalled
          </Text>
          <View style={s.search}>
            <Ionicons name="search" size={18} color={COLORS.textMuted} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search projects"
              placeholderTextColor={COLORS.textMuted}
              style={s.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              accessibilityLabel="Search projects"
            />
          </View>
          <ChipScroll options={FILTERS} value={filter} onChange={setFilter} />
          <ChipScroll options={SORTS} value={sort} onChange={setSort} />

          {shown.length === 0 ? (
            <Empty title="No projects match" body="Try another filter or clear the search." />
          ) : (
            shown.map((c) => <ProjectCardView key={c.name} c={c} />)
          )}
        </View>
      )}
    </Screen>
  );
}

function ProjectCardView({ c }: { c: ProjectCard }) {
  const pct = c.total ? c.done / c.total : 0;
  return (
    <Card onPress={() => router.push(`/project/${c.name}` as never)} accessibilityLabel={`${c.label}, ${c.open} open, ${c.overdue} overdue`}>
      <View style={s.head}>
        <Text style={s.title} numberOfLines={2}>{c.label}</Text>
        <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
      </View>
      <View style={s.pills}>
        <HealthPill kind={c.health} />
        {c.scope ? <Pill label={c.scope} /> : null}
        {c.status ? <Pill label={c.status} /> : null}
      </View>
      <View style={s.progress}>
        <View style={s.progressHead}>
          <Text style={s.muted}>{c.done} of {c.total} tasks done</Text>
          <Text style={s.pct}>{Math.round(pct * 100)}%</Text>
        </View>
        <ProgressBar scale={1} value={pct} height={8} />
      </View>
      <View style={s.stats}>
        <Stat label="Open" value={c.open} />
        <Stat label="Overdue" value={c.overdue} alarm={c.overdue > 0} />
        <Stat label="Requests waiting" value={c.waiting} />
      </View>
      <View style={s.foot}>
        <Text style={s.muted} numberOfLines={1}>
          {c.lastChange ? `Last activity ${ago(`${c.lastChange} 12:00:00`)}` : 'No activity yet'}
        </Text>
        <Avatars names={c.people} />
      </View>
    </Card>
  );
}

function Stat({ label, value, alarm }: { label: string; value: number; alarm?: boolean }) {
  return (
    <View style={s.stat}>
      <Text style={[s.statNum, alarm && { color: '#991B1B' }]}>{value}</Text>
      <Text style={s.statLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  summary: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, marginBottom: spacing.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, minHeight: 44, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  progress: { marginTop: spacing.md, gap: 6 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between' },
  pct: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  stats: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  stat: { flex: 1, backgroundColor: COLORS.bgMuted, borderRadius: borderRadius.md, padding: spacing.md, gap: 2 },
  statNum: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: COLORS.text },
  statLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.md },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
});
