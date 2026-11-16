import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/core/auth/store';
import { Screen } from '@/core/ui/Screen';
import { Row } from '@/core/ui/Row';
import { BottomSheet } from '@/core/ui/Dialog';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { NEXT_STAGE, type Stage } from '@/features/shared/types';
import { BulkBar } from './BulkBar';
import { GroupBar, QuickViews, ScopeChip, StatsStrip, type Stat } from './Overview';
import { SwipeHint } from './SwipeHint';
import { BoardView } from './BoardView';
import { CalendarView } from './CalendarView';
import { FilterSheet } from './FilterSheet';
import { RowSkeletons } from './ItemRow';
import { ListView } from './ListView';
import { MoveSheet, openItem } from './MoveSheet';
import { applyFilters, DUE_LABEL, EMPTY_FILTERS, filterCount, itemKey, NO_LENS, QUICK_VIEWS, SCOPES, selectable, type Item, type Lens, type Scope, type ViewMode } from './model';
import { useBacklogData, usePrefs } from './useBacklog';

const VIEWS: { value: ViewMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'list', label: 'List', icon: 'list-outline' },
  { value: 'board', label: 'Board', icon: 'albums-outline' },
  { value: 'calendar', label: 'Calendar', icon: 'calendar-outline' },
];

export function BacklogScreen() {
  const { prefs, update, ready } = usePrefs();
  const { data, items, loading, error, refresh, projectNames, move, bulk, progress, truncated, loadAll } = useBacklogData();
  const email = useAuthStore((st) => st.email);
  // Deep links from Today: /backlog?due=overdue|today|tomorrow|week|review&mine=1
  const params = useLocalSearchParams<{ due?: string; mine?: string }>();
  const [lens, setLens] = useState<Lens>(() => (params.due ? { due: params.due } : NO_LENS));
  const [selectRaw, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [sheet, setSheet] = useState(false);
  const [scopeSheet, setScopeSheet] = useState(false);
  const [moving, setMoving] = useState<Item | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // A deep link (/backlog?due=overdue&mine=1) replaces the lens and, with mine=1, the scope.
  const linkDue = params.due;
  const linkMine = params.mine === '1';
  const linkKey = `${linkDue ?? ''}|${linkMine ? 1 : 0}`;
  const [seenLink, setSeenLink] = useState(linkKey);
  if (seenLink !== linkKey) {
    setSeenLink(linkKey);
    setLens(linkDue ? { due: linkDue } : NO_LENS);
  }
  useEffect(() => {
    if (ready && linkMine) update({ scope: 'mine' });
  }, [linkKey, linkMine, ready, update]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchText), 250);
    return () => clearTimeout(t);
  }, [searchText]);

  const { view, filters, collapsed, scope, groupBy } = prefs;
  const selecting = selectRaw && view === 'list';
  const nFilters = filterCount(filters);

  const base = useMemo(() => ({ search, filters, email, scope, lens, includeDone: false }), [search, filters, email, scope, lens]);
  const listItems = useMemo(() => applyFilters(items, base), [items, base]);
  const boardItems = useMemo(() => applyFilters(items, { ...base, includeDone: true }), [items, base]);
  const calItems = listItems;
  const counts = {
    list: listItems.length,
    board: boardItems.length,
    calendar: calItems.filter((i) => i.end).length,
  };

  // Overview numbers ignore search, filters and the lens so the tiles and chips always describe the whole scope.
  const overview = useMemo(() => {
    const plain = { search: '', filters: EMPTY_FILTERS, email, lens: NO_LENS, includeDone: false };
    const scoped = (sc: Scope) => applyFilters(items, { ...plain, scope: sc });
    const inScope = scoped(scope);
    const by = (l: Lens, sc: Scope = scope) => applyFilters(items, { ...plain, scope: sc, lens: l }).length;
    return {
      scopes: { mine: scoped('mine').length, team: scoped('team').length, all: scoped('all').length } as Record<Scope, number>,
      open: inScope.length,
      overdue: by({ due: 'overdue' }),
      unassigned: by({ unassigned: true }),
      review: by({ due: 'review' }),
      blocked: applyFilters(items, { ...plain, scope, filters: { ...EMPTY_FILTERS, stages: ['Blocked'] } }).length,
      views: Object.fromEntries(
        QUICK_VIEWS.map((q) => [
          q.key,
          applyFilters(items, { ...plain, scope: q.scope, lens: q.lens, filters: { ...EMPTY_FILTERS, stages: q.stages ?? [] } }).length,
        ]),
      ) as Record<string, number>,
    };
  }, [items, scope, email]);

  const projectName = useCallback(
    (i: Item) => (i.project ? projectNames[i.project] || i.project : undefined),
    [projectNames],
  );

  const options = useMemo(() => {
    const projects = new Set<string>();
    const modules = new Set<string>();
    const tags = new Set<string>();
    for (const i of items) {
      if (i.project) projects.add(i.project);
      if (i.module) modules.add(i.module);
      for (const t of i.tags ?? []) tags.add(t);
    }
    return {
      projects: [...projects].map((p) => ({ value: p, label: projectNames[p] || p })).sort((a, b) => a.label.localeCompare(b.label)),
      modules: [...modules].sort(),
      tags: [...tags].sort(),
    };
  }, [items, projectNames]);

  const onAdvance = useCallback(
    (i: Item) => {
      const next = NEXT_STAGE[i.stage];
      if (next) move(i, next);
    },
    [move],
  );
  const onMove = useCallback(
    (i: Item, to: Stage) => {
      setMoving(null);
      move(i, to);
    },
    [move],
  );
  const onToggle = useCallback(
    (key: string) => update({ collapsed: collapsed.includes(key) ? collapsed.filter((k) => k !== key) : [...collapsed, key] }),
    [collapsed, update],
  );
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);
  const clearLink = useCallback(() => {
    setLens(NO_LENS);
    router.setParams({ due: undefined, mine: undefined });
  }, []);
  const clearAll = useCallback(() => {
    update({ filters: EMPTY_FILTERS });
    setSearchText('');
    setSearch('');
    clearLink();
  }, [update, clearLink]);
  const setScope = useCallback((sc: Scope) => update({ scope: sc }), [update]);
  const pickView = useCallback(
    (key: string) => {
      const q = QUICK_VIEWS.find((x) => x.key === key);
      if (!q) return;
      update({ scope: q.scope, filters: { ...EMPTY_FILTERS, stages: q.stages ?? [] } });
      setLens(q.lens);
      setSearchText('');
      router.setParams({ due: undefined, mine: undefined });
    },
    [update],
  );
  const tile = (l: Lens, stages: string[] = []) => {
    update({ filters: { ...EMPTY_FILTERS, stages } });
    setLens(l);
  };
  const lensKey = lens.unassigned ? 'unassigned' : lens.due ?? '';
  const stats: Stat[] = [
    { key: 'open', label: 'Open', value: overview.open, on: !lensKey && !filters.stages.length, onPress: () => tile(NO_LENS) },
    { key: 'overdue', label: 'Overdue', value: overview.overdue, hot: overview.overdue > 0, on: lensKey === 'overdue', onPress: () => tile({ due: 'overdue' }) },
    { key: 'unassigned', label: 'Unassigned', value: overview.unassigned, on: lensKey === 'unassigned', onPress: () => tile({ unassigned: true }) },
    { key: 'review', label: 'In review', value: overview.review, on: lensKey === 'review', onPress: () => tile({ due: 'review' }) },
    { key: 'blocked', label: 'Blocked', value: overview.blocked, on: filters.stages.length === 1 && filters.stages[0] === 'Blocked', onPress: () => tile(NO_LENS, ['Blocked']) },
  ];

  // Select mode: long-press a row, tap to add or remove, act on all of them from the bottom bar.
  const exitSelect = useCallback(() => {
    setSelecting(false);
    setSelected(new Set());
  }, []);
  const onSelect = useCallback((i: Item) => {
    if (!selectable(i)) return;
    setSelecting(true);
    setSelected((cur) => {
      const n = new Set(cur);
      const k = itemKey(i);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }, []);
  const selectable_ = useMemo(() => listItems.filter(selectable), [listItems]);
  const onSelectAll = useCallback(() => {
    setSelected((cur) => (cur.size === selectable_.length ? new Set() : new Set(selectable_.map(itemKey))));
  }, [selectable_]);
  const onApply = useCallback(
    (v: Parameters<typeof bulk>[1], label: string) => {
      const rows = items.filter((i) => selected.has(itemKey(i)));
      exitSelect();
      bulk(rows, v, label);
    },
    [items, selected, bulk, exitSelect],
  );

  const hasLens = !!lens.due || !!lens.unassigned;
  const hasFilters = nFilters > 0 || !!search || hasLens;
  const initialLoading = (loading && !data) || !ready;

  const header = (
    <View style={s.overview}>
      <SwipeHint style={{ marginHorizontal: spacing.lg }} />
      {truncated && data ? (
        <Pressable onPress={loadAll} style={s.trunc} accessibilityRole="button" accessibilityLabel="Load the full backlog">
          <Text style={s.truncText} numberOfLines={2}>Showing {data.items.length} of {data.total}. Load all</Text>
        </Pressable>
      ) : null}
      <StatsStrip stats={stats} />
      <QuickViews scope={scope} lens={lens} filters={filters} counts={overview.views} onPick={pickView} />
      <GroupBar value={groupBy} onChange={(g) => update({ groupBy: g })} />
    </View>
  );

  let body;
  if (initialLoading) body = <RowSkeletons />;
  else if (view === 'board') body = <BoardView items={boardItems} projectName={projectName} onOpen={openItem} onMenu={setMoving} />;
  else if (view === 'calendar')
    body = <CalendarView items={calItems} projectName={projectName} onOpen={openItem} onAdvance={onAdvance} onMove={move} onMenu={setMoving} onRefresh={onRefresh} refreshing={refreshing} />;
  else
    body = (
      <ListView
        items={listItems}
        groupBy={groupBy}
        header={header}
        selecting={selecting}
        selected={selected}
        onSelect={onSelect}
        onMove={move}
        bottomPad={selecting ? 190 : 120}
        loading={false}
        collapsed={collapsed}
        onToggle={onToggle}
        projectName={projectName}
        onOpen={openItem}
        onAdvance={onAdvance}
        onMenu={setMoving}
        onRefresh={onRefresh}
        refreshing={refreshing}
        hasFilters={hasFilters}
        onClear={clearAll}
      />
    );

  return (
    <Screen tab title="Work" scroll={false} contentPadded={false} loading={false} error={!data ? error : null} onRetry={refresh}>
      <View style={s.top}>
        <View style={s.switch} accessibilityRole="tablist">
          {VIEWS.map((v) => {
            const on = v.value === view;
            return (
              <Pressable
                key={v.value}
                onPress={() => update({ view: v.value })}
                style={[s.tab, on && s.tabOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${v.label} view, ${counts[v.value]} items`}
              >
                <Ionicons name={v.icon} size={16} color={on ? COLORS.text : COLORS.textMuted} />
                <Text style={[s.tabText, on && s.tabTextOn]} numberOfLines={1}>{v.label}</Text>
                <Text style={s.tabCount} numberOfLines={1}>{counts[v.value]}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={s.searchRow}>
          <View style={s.search}>
            <Ionicons name="search" size={18} color={COLORS.textMuted} />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Search work"
              placeholderTextColor={COLORS.textMuted}
              style={s.input}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Search work by title"
            />
            {searchText ? (
              <Pressable onPress={() => setSearchText('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
              </Pressable>
            ) : null}
          </View>
          <ScopeChip scope={scope} counts={overview.scopes} onPress={() => setScopeSheet(true)} />
          <Pressable onPress={() => setSheet(true)} style={[s.filterBtn, nFilters > 0 && s.filterBtnOn]} accessibilityRole="button" accessibilityLabel={`Filters, ${nFilters} active`}>
            <Ionicons name="options-outline" size={22} color={nFilters > 0 ? '#fff' : COLORS.text} />
            {nFilters > 0 ? (
              <View style={s.badge}>
                <Text style={s.badgeText}>{nFilters}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
        {hasLens || nFilters > 0 ? (
          <View style={s.chips}>
            {hasLens ? (
              <Pressable onPress={clearLink} style={s.activeChip} accessibilityRole="button" accessibilityLabel="Remove quick filter">
                <Text style={s.activeText} numberOfLines={1}>
                  {lens.unassigned ? 'Unassigned' : DUE_LABEL[lens.due ?? ''] ?? lens.due}
                </Text>
                <Ionicons name="close" size={16} color="#fff" />
              </Pressable>
            ) : null}
            {nFilters > 0 ? (
              <Pressable onPress={() => update({ filters: EMPTY_FILTERS })} style={s.clear} accessibilityRole="button" accessibilityLabel="Clear filters">
                <Text style={s.clearText}>Clear {nFilters} filter{nFilters === 1 ? '' : 's'}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
      <View style={s.body}>
        {body}
        {selecting ? (
          <BulkBar count={selected.size} total={selectable_.length} progress={progress} onApply={onApply} onSelectAll={onSelectAll} onCancel={exitSelect} />
        ) : progress ? (
          <View style={s.working}><Text style={s.workingText}>{progress.label} {progress.done}/{progress.total}</Text></View>
        ) : null}
      </View>
      <BottomSheet visible={scopeSheet} onClose={() => setScopeSheet(false)} title="Show">
        {SCOPES.map((o, i) => (
          <Row
            key={o.value}
            title={o.label}
            subtitle={o.value === 'mine' ? 'Work assigned to you' : o.value === 'team' ? 'Everything assigned to someone' : 'The whole backlog, assigned or not'}
            right={<Text style={s.scopeCount}>{overview.scopes[o.value]}</Text>}
            left={<Ionicons name={scope === o.value ? 'radio-button-on' : 'radio-button-off'} size={22} color={COLORS.text} />}
            divider={i < SCOPES.length - 1}
            onPress={() => {
              setScope(o.value);
              setScopeSheet(false);
            }}
          />
        ))}
      </BottomSheet>
      <FilterSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        filters={filters}
        onChange={(f) => update({ filters: f })}
        options={options}
        resultCount={view === 'board' ? counts.board : counts.list}
      />
      <MoveSheet item={moving} onClose={() => setMoving(null)} onMove={onMove} />
    </Screen>
  );
}

const s = StyleSheet.create({
  scopeCount: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  top: { backgroundColor: COLORS.surface, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border, gap: spacing.sm },
  switch: { flexDirection: 'row', backgroundColor: COLORS.bgMuted, borderRadius: 999, padding: 4 },
  tab: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 4 },
  tabOn: { backgroundColor: COLORS.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  tabText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textMuted },
  tabTextOn: { fontFamily: fontFamily.semiBold, color: COLORS.text },
  tabCount: { fontFamily: fontFamily.regular, fontSize: 11, color: COLORS.textMuted },
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  search: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: 12, backgroundColor: COLORS.bgMuted },
  input: { flex: 1, minHeight: 44, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text, paddingVertical: 0, outlineStyle: 'none' } as never,
  filterBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bgMuted },
  filterBtnOn: { backgroundColor: COLORS.text },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: COLORS.danger, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fontFamily.semiBold, fontSize: 10, color: '#fff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  activeChip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 36, paddingHorizontal: spacing.md, borderRadius: 999, backgroundColor: COLORS.text },
  activeText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: '#fff' },
  clear: { alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: spacing.sm, justifyContent: 'center' },
  clearText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textSecondary, textDecorationLine: 'underline' },
  body: { flex: 1 },
  overview: { gap: spacing.sm, paddingVertical: spacing.sm },
  trunc: { marginHorizontal: spacing.lg, minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 12, backgroundColor: '#FFFBEB' },
  truncText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: '#92400E' },
  working: { position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: spacing.lg, minHeight: 44, borderRadius: 22, backgroundColor: COLORS.text, alignItems: 'center', justifyContent: 'center' },
  workingText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: '#fff' },
});
