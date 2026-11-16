import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/core/ui/Screen';
import { Button } from '@/core/ui/Button';
import { Input } from '@/core/ui/Input';
import { Skeleton } from '@/core/ui/Skeleton';
import { mapAxiosError } from '@/core/api/client';
import { todayKey } from '@/core/date';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/core/theme';
import { ItGate } from '../shared/ItGate';
import { useItAccess } from '../shared/useItAccess';
import { ChipRow } from './Chips';
import { CrashRow } from './CrashRow';
import { useStatusFlow } from './useStatusFlow';
import { fetchApps, fetchProblems, KIND_LABEL, type IssueKind, type IssueStatus, type Problem, type ProblemsResult } from './model';

type Range = 'all' | 'today' | '7' | '30';

const STATUSES: IssueStatus[] = ['Open', 'Resolved', 'Ignored'];
const KINDS: IssueKind[] = ['crash', 'error', 'api', 'log'];

function sinceFor(r: Range): string | undefined {
  if (r === 'all') return undefined;
  const d = new Date();
  if (r !== 'today') d.setDate(d.getDate() - Number(r));
  return todayKey(d);
}

export function CrashesScreen() {
  return (
    <ItGate title="Crashlytics">
      <Inbox />
    </ItGate>
  );
}

function Inbox() {
  const sm = useItAccess((st) => st.isSystemManager);
  const [app, setApp] = useState('all');
  const [apps, setApps] = useState<string[]>([]);
  const [status, setStatus] = useState<IssueStatus>('Open');
  const [kind, setKind] = useState<IssueKind | 'all'>('all');
  const [range, setRange] = useState<Range>('all');
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [data, setData] = useState<ProblemsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setSearch(text.trim()), 350);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    fetchApps().then((r) => setApps(r.rows.map((x) => x.app))).catch(() => {});
  }, []);

  const load = useCallback(
    async (quiet?: boolean) => {
      const mine = ++seq.current;
      if (!quiet) setLoading(true);
      try {
        const res = await fetchProblems({
          app: app === 'all' ? undefined : app,
          status,
          kind: kind === 'all' ? undefined : kind,
          search: search || undefined,
          since: sinceFor(range),
        });
        if (mine !== seq.current) return;
        setData(res);
        setError(null);
      } catch (e) {
        if (mine === seq.current) setError(mapAxiosError(e).message);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [app, status, kind, range, search],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      setPicked(new Set());
      load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const onChanged = useCallback(
    (names: string[], to: IssueStatus | null) => {
      if (to) {
        const gone = new Set(names);
        setData((d) => (d ? { ...d, rows: d.rows.filter((r) => !gone.has(r.name)), total: d.total - names.length } : d));
      }
      setPicked(new Set());
      load(true);
    },
    [load],
  );

  const flow = useStatusFlow(sm, onChanged);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const maxPeople = useMemo(() => rows.reduce((m, r) => Math.max(m, r.people), 0), [rows]);
  const selecting = picked.size > 0;

  const toggle = useCallback((p: Problem) => {
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(p.name)) next.delete(p.name);
      else next.add(p.name);
      return next;
    });
  }, []);

  const open = useCallback((p: Problem) => router.push({ pathname: '/it/crash/[name]', params: { name: p.name } } as never), []);
  const resolve = useCallback((p: Problem) => flow.ask([p], 'Resolved'), [flow]);
  const ignore = useCallback((p: Problem) => flow.ask([p], 'Ignored'), [flow]);
  const reopen = useCallback((p: Problem) => flow.ask([p], 'Open'), [flow]);

  const refresh = async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  };

  const people = rows.reduce((a, r) => a + r.people, 0);
  const crashes = rows.filter((r) => r.kind === 'crash').length;
  const chosen = rows.filter((r) => picked.has(r.name));

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      <View style={[s.hero, crashes > 0 && status === 'Open' && { backgroundColor: '#3B0A0A' }]}>
        <Text style={s.heroN}>{data ? data.total : '-'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.heroT}>{status.toLowerCase()} {data?.total === 1 ? 'issue' : 'issues'}</Text>
          <Text style={s.heroS}>
            {data ? `${people} ${people === 1 ? 'person' : 'people'} hit${crashes ? `, ${crashes} ${crashes === 1 ? 'crash' : 'crashes'}` : ''}` : 'Loading'}
          </Text>
        </View>
        <Ionicons name={crashes > 0 && status === 'Open' ? 'flame' : 'shield-checkmark'} size={34} color="rgba(255,255,255,0.85)" />
      </View>
      <View style={s.pad}>
        <Input value={text} onChangeText={setText} placeholder="Search title or culprit" autoCapitalize="none" autoCorrect={false} style={{ marginBottom: 0 }} accessibilityLabel="Search issues" />
      </View>
      {apps.length > 1 ? (
        <ChipRow value={app} onChange={setApp} options={[{ value: 'all', label: 'All apps' }, ...apps.map((a) => ({ value: a, label: a.replace(/^Upande /, '') }))]} />
      ) : null}
      <ChipRow
        value={status}
        onChange={setStatus}
        options={STATUSES.map((v) => ({ value: v, label: `${v} ${data?.by_status[v] ?? 0}` }))}
      />
      <ChipRow
        value={kind}
        onChange={setKind}
        options={[{ value: 'all', label: 'Any kind' }, ...KINDS.map((k) => ({ value: k, label: `${KIND_LABEL[k]} ${data?.by_kind[k] ?? 0}` }))]}
      />
      <ChipRow
        value={range}
        onChange={setRange}
        options={[{ value: 'all', label: 'All time' }, { value: 'today', label: 'Today' }, { value: '7', label: '7 days' }, { value: '30', label: '30 days' }]}
      />
      {selecting ? (
        <View style={[s.pad, s.selBar]}>
          <Text style={s.selText}>{picked.size} selected</Text>
          <Button label="All" size="sm" variant="outline" onPress={() => setPicked(new Set(rows.map((r) => r.name)))} />
          <Button label="Clear" size="sm" variant="ghost" onPress={() => setPicked(new Set())} />
        </View>
      ) : null}
    </View>
  );

  let empty = null;
  if (loading) {
    empty = (
      <View style={[s.pad, { gap: spacing.md }]}>
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={132} radius={borderRadius.md} />)}
      </View>
    );
  } else if (error) {
    empty = (
      <View style={s.empty}>
        <Ionicons name="cloud-offline-outline" size={40} color={COLORS.textMuted} />
        <Text style={s.emptyT}>Could not load issues</Text>
        <Text style={s.emptyS}>{error}</Text>
        <Button label="Try again" onPress={() => load()} />
      </View>
    );
  } else if (!rows.length) {
    empty = (
      <View style={s.empty}>
        <Ionicons name={status === 'Open' ? 'sparkles-outline' : 'file-tray-outline'} size={40} color={COLORS.textMuted} />
        <Text style={s.emptyT}>{status === 'Open' && !search ? 'All quiet' : 'Nothing here'}</Text>
        <Text style={s.emptyS}>
          {status === 'Open' && !search ? 'No open issues for these filters. The apps are behaving.' : 'No issues match these filters.'}
        </Text>
      </View>
    );
  }

  return (
    <Screen
      title="Crashlytics"
      scroll={false}
      contentPadded={false}
      footer={
        selecting ? (
          <View style={s.footer}>
            <Button label={`Ignore ${picked.size}`} variant="outline" onPress={() => flow.ask(chosen, 'Ignored')} style={{ flex: 1 }} />
            <Button label={`Resolve ${picked.size}`} onPress={() => flow.ask(chosen, 'Resolved')} color="#16A34A" style={{ flex: 1 }} />
          </View>
        ) : undefined
      }
    >
      <FlatList
        data={loading || error ? [] : rows}
        keyExtractor={(r) => r.name}
        ListHeaderComponent={header}
        ListEmptyComponent={empty ?? undefined}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        renderItem={({ item }) => (
          <View style={s.pad}>
            <CrashRow
              p={item}
              maxPeople={maxPeople}
              selecting={selecting}
              selected={picked.has(item.name)}
              onOpen={open}
              onToggle={toggle}
              onLongPress={toggle}
              onResolve={resolve}
              onIgnore={ignore}
              onReopen={reopen}
            />
          </View>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.text} />}
        initialNumToRender={8}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
      />
      {flow.sheet}
    </Screen>
  );
}

const s = StyleSheet.create({
  pad: { paddingHorizontal: spacing.lg },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: '#171717',
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
  },
  heroN: { fontFamily: fontFamily.bold, fontSize: 44, color: '#fff', lineHeight: 50 },
  heroT: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: '#fff', textTransform: 'capitalize' },
  heroS: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: 'rgba(255,255,255,0.7)' },
  selBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  selText: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  footer: { flexDirection: 'row', gap: spacing.md },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyT: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text },
  emptyS: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, textAlign: 'center', marginBottom: spacing.sm },
});
