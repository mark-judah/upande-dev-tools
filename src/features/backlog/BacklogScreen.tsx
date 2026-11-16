import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/core/auth/store';
import { Screen } from '@/core/ui/Screen';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { NEXT_STAGE, type Stage } from '@/features/shared/types';
import { BoardView } from './BoardView';
import { CalendarView } from './CalendarView';
import { FilterSheet } from './FilterSheet';
import { RowSkeletons } from './ItemRow';
import { ListView } from './ListView';
import { MoveSheet, openItem } from './MoveSheet';
import { applyFilters, DUE_LABEL, EMPTY_FILTERS, filterCount, type Bucket, type Item, type ViewMode } from './model';
import { useBacklogData, usePrefs } from './useBacklog';

const VIEWS: { value: ViewMode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'list', label: 'List', icon: 'list-outline' },
  { value: 'board', label: 'Board', icon: 'albums-outline' },
  { value: 'calendar', label: 'Calendar', icon: 'calendar-outline' },
];

export function BacklogScreen() {
  const { prefs, update, ready } = usePrefs();
  const { data, items, loading, error, refresh, projectNames, move } = useBacklogData();
  const email = useAuthStore((st) => st.email);
  // Deep links from Today: /backlog?due=overdue|today|tomorrow|week|review&mine=1
  const params = useLocalSearchParams<{ due?: string; mine?: string }>();
  const due = params.due;
  const mineParam = params.mine === '1';

  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [sheet, setSheet] = useState(false);
  const [moving, setMoving] = useState<Item | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchText), 250);
    return () => clearTimeout(t);
  }, [searchText]);

  const { view, filters, collapsed } = prefs;
  const nFilters = filterCount(filters);

  const base = useMemo(
    () => ({ search, filters, email, due, mineParam, includeDone: false }),
    [search, filters, email, due, mineParam],
  );
  const listItems = useMemo(() => applyFilters(items, base), [items, base]);
  const boardItems = useMemo(() => applyFilters(items, { ...base, includeDone: true }), [items, base]);
  const calItems = useMemo(() => listItems, [listItems]);
  const counts = {
    list: listItems.length,
    board: boardItems.length,
    calendar: calItems.filter((i) => i.end).length,
  };

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
    (key: Bucket) => update({ collapsed: collapsed.includes(key) ? collapsed.filter((k) => k !== key) : [...collapsed, key] }),
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
  const clearAll = useCallback(() => {
    update({ filters: EMPTY_FILTERS });
    setSearchText('');
    setSearch('');
    router.setParams({ due: undefined, mine: undefined });
  }, [update]);

  const hasFilters = nFilters > 0 || !!search || !!due || mineParam;
  const initialLoading = (loading && !data) || !ready;

  let body;
  if (initialLoading) body = <RowSkeletons />;
  else if (view === 'board') body = <BoardView items={boardItems} projectName={projectName} onOpen={openItem} onMenu={setMoving} />;
  else if (view === 'calendar')
    body = <CalendarView items={calItems} projectName={projectName} onOpen={openItem} onAdvance={onAdvance} onMenu={setMoving} onRefresh={onRefresh} refreshing={refreshing} />;
  else
    body = (
      <ListView
        items={listItems}
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
          <Pressable onPress={() => setSheet(true)} style={[s.filterBtn, nFilters > 0 && s.filterBtnOn]} accessibilityRole="button" accessibilityLabel={`Filters, ${nFilters} active`}>
            <Ionicons name="options-outline" size={22} color={nFilters > 0 ? '#fff' : COLORS.text} />
            {nFilters > 0 ? (
              <View style={s.badge}>
                <Text style={s.badgeText}>{nFilters}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
        {due || mineParam || nFilters > 0 ? (
          <View style={s.chips}>
            {due || mineParam ? (
              <Pressable onPress={() => router.setParams({ due: undefined, mine: undefined })} style={s.activeChip} accessibilityRole="button" accessibilityLabel="Remove link filter">
                <Text style={s.activeText} numberOfLines={1}>
                  {mineParam ? 'Mine' : ''}{mineParam && due ? ' · ' : ''}{due ? DUE_LABEL[due] ?? due : ''}
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
      <View style={s.body}>{body}</View>
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
});
