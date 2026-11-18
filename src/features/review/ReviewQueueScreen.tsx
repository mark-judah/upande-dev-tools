import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Screen } from '@/core/ui/Screen';
import { Button } from '@/core/ui/Button';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { Input } from '@/core/ui/Input';
import { Skeleton } from '@/core/ui/Skeleton';
import { SwipeRow, type SwipeAction } from '@/core/ui/SwipeRow';
import { BottomSheet } from '@/core/ui/Dialog';
import { useToast } from '@/core/ui/Toast';
import { mapAxiosError } from '@/core/api/client';
import { useLoad } from '@/features/shared/useLoad';
import { useAuthStore } from '@/core/auth/store';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { DecisionSheet, type Outcome, type SheetMode } from './DecisionSheet';
import { TriageRow, rowWrap } from './TriageRow';
import { loadDetail, loadOptions, loadPeople, loadProjects, loadQueue, triage, type QueueData } from './api';
import {
  ACCEPT_GREEN,
  DEFER_AMBER,
  TAB_LABEL,
  VIEWS,
  decidedThisWeek,
  normTitle,
  type Detail,
  type Person,
  type QueueOptions,
  type QueueRow,
  type Quick,
  type RowAction,
  type TabKey,
} from './model';

const NO_OPTIONS: QueueOptions = { decision_priorities: ['Low', 'Medium', 'High', 'Urgent'], tags: [], projects: [] };

type SheetState = { mode: SheetMode; rows: QueueRow[] } | null;

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** The PM triage workstation: every request that needs a decision, with swipe-to-decide. */
export function ReviewQueueScreen() {
  const toast = useToast();
  const myEmail = useAuthStore((st) => st.email);
  const me = (myEmail ?? '').toLowerCase();

  const { data, loading, error, reload } = useLoad<QueueData>(loadQueue);
  const [options, setOptions] = useState<QueueOptions>(NO_OPTIONS);
  const [people, setPeople] = useState<Person[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    await reload();
    setHidden(new Set());
  }, [reload]);

  useEffect(() => {
    Promise.all([loadOptions().catch(() => null), loadProjects().catch(() => null), loadPeople().catch(() => [] as Person[])]).then(
      ([o, p, ppl]) => {
        setOptions({
          decision_priorities: o?.decision_priorities?.length ? o.decision_priorities : NO_OPTIONS.decision_priorities,
          tags: o?.tags ?? [],
          projects: p ? p.map((x) => ({ value: x.name, label: x.project_name || x.name })) : (o?.projects ?? []),
        });
        setPeople(ppl);
      },
    );
  }, []);

  const [tab, setTab] = useState<TabKey>('waiting');
  const [quick, setQuick] = useState<Quick>('all');
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim().toLowerCase(), 250);

  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Record<string, Detail | 'loading'>>({});
  const [sheet, setSheet] = useState<SheetState>(null);
  const [menu, setMenu] = useState<QueueRow | null>(null);

  const canDecide = data ? VIEWS.some((v) => data.views[v].can_decide) : false;

  const all = useMemo(() => (data ? VIEWS.flatMap((v) => data.views[v].rows) : []), [data]);
  const decided = useMemo(() => all.filter((r) => r.status !== 'Under Review' && decidedThisWeek(r)), [all]);

  const dupes = useMemo(() => {
    const by = new Map<string, string[]>();
    for (const r of all) {
      const k = normTitle(r.title);
      if (k) by.set(k, [...(by.get(k) ?? []), r.name]);
    }
    return (r: QueueRow) => by.get(normTitle(r.title))?.find((n) => n !== r.name);
  }, [all]);

  const waiting = useMemo(() => (data ? data.views.waiting.rows : []), [data]);
  const stale = useMemo(() => waiting.filter((r) => r.age_days >= 7), [waiting]);
  const awaiting = useMemo(
    () => waiting.filter((r) => !!me && r.requested_for.toLowerCase() === me),
    [waiting, me],
  );

  const rows = useMemo(() => {
    if (!data) return [];
    let list: QueueRow[] = tab === 'decided' ? decided : data.views[tab].rows;
    if (tab === 'waiting' && quick === 'stale') list = stale;
    if (tab === 'waiting' && quick === 'mine') list = awaiting;
    if (q) {
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.raised_by_name.toLowerCase().includes(q) ||
          r.product_area.toLowerCase().includes(q),
      );
    }
    return list.filter((r) => !hidden.has(r.name));
  }, [data, tab, quick, q, decided, stale, awaiting, hidden]);

  const goTab = (t: TabKey, qk: Quick = 'all') => {
    setTab(t);
    setQuick(qk);
    setSelecting(false);
    setPicked(new Set());
  };

  // ---- decisions
  const finish = useCallback(
    (o: Outcome) => {
      const n = o.done.length;
      const many = n > 1 ? ` ${n} requests` : '';
      setHidden((h) => new Set([...h, ...o.done.map((r) => r.name)]));
      setPicked(new Set());
      setSelecting(false);
      if (o.mode === 'defer') {
        toast.showSuccess(`Deferred${many}`, {
          action: {
            label: 'Undo',
            onPress: () => {
              Promise.all(o.done.map((r) => triage(r.name, 'Reopen')))
                .then(() => toast.showInfo('Back under review'))
                .catch((e) => toast.showError(mapAxiosError(e).message))
                .finally(load);
            },
          },
        });
      } else {
        const text = { accept: 'Accepted and scheduled', schedule: 'Scheduled', reassign: 'Reassigned', reject: 'Rejected' }[o.mode];
        toast.showSuccess(`${text}${many}`);
      }
      load();
    },
    [load, toast],
  );

  const direct = useCallback(
    async (r: QueueRow, action: 'Reopen' | 'Approve') => {
      try {
        await triage(r.name, action);
        setHidden((h) => new Set([...h, r.name]));
        toast.showSuccess(action === 'Reopen' ? 'Reopened for review' : 'Approved');
        load();
      } catch (e) {
        toast.showError(mapAxiosError(e).message);
      }
    },
    [load, toast],
  );

  const act = useCallback(
    (r: QueueRow, a: RowAction) => {
      setMenu(null);
      if (a === 'reopen') return void direct(r, 'Reopen');
      if (a === 'approve') return void direct(r, 'Approve');
      setSheet({ mode: a as SheetMode, rows: [r] });
    },
    [direct],
  );

  const toggleOpen = useCallback((r: QueueRow) => {
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(r.name)) next.delete(r.name);
      else next.add(r.name);
      return next;
    });
    setDetails((cur) => {
      if (cur[r.name]) return cur;
      loadDetail(r.name)
        .then((d) => setDetails((c) => ({ ...c, [r.name]: d })))
        .catch((e) => setDetails((c) => ({ ...c, [r.name]: { success: false, error: mapAxiosError(e).message } })));
      return { ...cur, [r.name]: 'loading' };
    });
  }, []);

  const pick = useCallback((r: QueueRow) => {
    setSelecting(true);
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(r.name)) next.delete(r.name);
      else next.add(r.name);
      if (!next.size) setSelecting(false);
      return next;
    });
  }, []);

  const swipes = (r: QueueRow): { right?: SwipeAction; left?: SwipeAction } => {
    const has = (a: RowAction) => r.actions.includes(a);
    if (has('accept')) {
      return {
        right: { label: 'Accept', icon: 'checkmark-circle', color: ACCEPT_GREEN, onTrigger: () => act(r, 'accept') },
        left: has('defer') ? { label: 'Defer', icon: 'time', color: DEFER_AMBER, onTrigger: () => act(r, 'defer') } : undefined,
      };
    }
    if (has('schedule')) return { right: { label: 'Schedule', icon: 'calendar', color: ACCEPT_GREEN, onTrigger: () => act(r, 'schedule') } };
    if (has('reopen')) return { right: { label: 'Reopen', icon: 'refresh-circle', color: COLORS.primary, onTrigger: () => act(r, 'reopen') } };
    if (has('reassign')) return { right: { label: 'Reassign', icon: 'people', color: COLORS.primary, onTrigger: () => act(r, 'reassign') } };
    return {};
  };

  const pickedRows = rows.filter((r) => picked.has(r.name));
  const bulkOk = pickedRows.length > 0 && pickedRows.every((r) => r.actions.includes('accept'));

  // ---- header
  const counts = data?.views.waiting.counts;
  const header = (
    <View style={s.header}>
      <View style={s.tiles}>
        <Tile label="Waiting" value={waiting.length} active={tab === 'waiting' && quick === 'all'} onPress={() => goTab('waiting')} />
        <Tile label="Stale (a week+)" value={stale.length} active={tab === 'waiting' && quick === 'stale'} onPress={() => goTab('waiting', 'stale')} />
        <Tile label="Awaiting you" value={awaiting.length} active={tab === 'waiting' && quick === 'mine'} onPress={() => goTab('waiting', 'mine')} />
        <Tile label="Decided this week" value={decided.length} active={tab === 'decided'} onPress={() => goTab('decided')} />
      </View>

      {data && !canDecide ? (
        <View style={s.note}>
          <Ionicons name="lock-closed-outline" size={16} color={COLORS.textSecondary} />
          <Text style={s.noteText}>Deciding needs the Projects Manager role. You can still read the queue.</Text>
        </View>
      ) : null}

      <Input
        value={query}
        onChangeText={setQuery}
        placeholder="Search title, person or area"
        returnKeyType="search"
        autoCorrect={false}
        clearButtonMode="while-editing"
        accessibilityLabel="Search requests"
        style={s.search}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {VIEWS.map((v) => (
          <DecisionChip
            key={v}
            label={`${TAB_LABEL[v]}${counts ? ` ${counts[v]}` : ''}`}
            selected={tab === v && quick === 'all'}
            onPress={() => goTab(v)}
          />
        ))}
        {quick !== 'all' ? <DecisionChip label="Clear filter" selected={false} onPress={() => setQuick('all')} /> : null}
      </ScrollView>

      {selecting ? (
        <View style={s.selectBar}>
          <Text style={s.selectText}>{picked.size} selected</Text>
          <Pressable
            onPress={() => setPicked(new Set(rows.filter((r) => r.actions.includes('accept')).map((r) => r.name)))}
            style={s.link}
            accessibilityRole="button"
          >
            <Text style={s.linkText}>Select all</Text>
          </Pressable>
          <Pressable onPress={() => { setSelecting(false); setPicked(new Set()); }} style={s.link} accessibilityRole="button">
            <Text style={s.linkText}>Cancel</Text>
          </Pressable>
        </View>
      ) : canDecide && tab === 'waiting' && rows.length ? (
        <Text style={s.tip}>Swipe right to accept, left to defer. Press and hold to select several.</Text>
      ) : null}
    </View>
  );

  const empty = (
    <View style={s.empty}>
      <Ionicons name={q ? 'search-outline' : 'checkmark-done-circle-outline'} size={44} color={COLORS.textMuted} />
      <Text style={s.emptyTitle}>{q ? 'Nothing matches' : tab === 'waiting' && quick === 'all' ? 'Queue is clear' : 'Nothing here'}</Text>
      <Text style={s.emptyBody}>
        {q ? 'Try another search.' : tab === 'waiting' ? 'Every request has had a decision.' : 'No requests in this list right now.'}
      </Text>
    </View>
  );

  return (
    <Screen
      title="Review queue"
      scroll={false}
      contentPadded={false}
      error={error && !data ? error : null}
      onRetry={load}
      footer={
        selecting ? (
          <View style={s.bulk}>
            <View style={s.bulkBtn}>
              <Button label="Accept" color={ACCEPT_GREEN} disabled={!bulkOk} onPress={() => setSheet({ mode: 'accept', rows: pickedRows })} singleLine />
            </View>
            <View style={s.bulkBtn}>
              <Button label="Defer" color={DEFER_AMBER} disabled={!bulkOk} onPress={() => setSheet({ mode: 'defer', rows: pickedRows })} singleLine />
            </View>
            <View style={s.bulkBtn}>
              <Button label="Reject" variant="outline" disabled={!bulkOk} onPress={() => setSheet({ mode: 'reject', rows: pickedRows })} singleLine />
            </View>
          </View>
        ) : undefined
      }
    >
      {loading && !data ? (
        <View style={s.list}>
          {header}
          {[0, 1, 2].map((i) => <RowSkeleton key={i} />)}
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.name}
          extraData={[open, details, picked, selecting]}
          renderItem={({ item }) => {
            const sw = swipes(item);
            return (
              <View style={rowWrap}>
                <SwipeRow radius={borderRadius.md} swipeRight={sw.right} swipeLeft={sw.left} disabled={selecting}>
                  <TriageRow
                    item={item}
                    description={data?.descriptions[item.name]}
                    duplicateOf={dupes(item)}
                    selecting={selecting}
                    selected={picked.has(item.name)}
                    expanded={open.has(item.name)}
                    detail={details[item.name]}
                    onPress={() => (selecting ? pick(item) : router.push(`/request/${item.name}` as never))}
                    onLongPress={() => item.actions.includes('accept') && pick(item)}
                    onToggle={() => toggleOpen(item)}
                    onMenu={() => setMenu(item)}
                  />
                </SwipeRow>
              </View>
            );
          }}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          contentContainerStyle={s.list}
          refreshing={loading}
          onRefresh={load}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={6}
          windowSize={7}
          showsVerticalScrollIndicator={false}
        />
      )}

      <DecisionSheet
        mode={sheet?.mode ?? null}
        rows={sheet?.rows ?? []}
        people={people}
        options={options}
        myEmail={myEmail}
        onClose={() => setSheet(null)}
        onDone={finish}
      />

      <BottomSheet visible={!!menu} onClose={() => setMenu(null)} title={menu?.title ?? ''} subtitle={menu ? `${menu.name} · ${menu.status}` : undefined}>
        {menu ? (
          <>
            <MenuItem icon="open-outline" label="Open request" onPress={() => { const n = menu.name; setMenu(null); router.push(`/request/${n}` as never); }} />
            {menu.actions.includes('accept') ? <MenuItem icon="checkmark-circle-outline" label="Accept and schedule" onPress={() => act(menu, 'accept')} /> : null}
            {menu.actions.includes('approve') ? <MenuItem icon="thumbs-up-outline" label="Approve, schedule later" onPress={() => act(menu, 'approve')} /> : null}
            {menu.actions.includes('schedule') ? <MenuItem icon="calendar-outline" label="Schedule" onPress={() => act(menu, 'schedule')} /> : null}
            {menu.actions.includes('reassign') ? <MenuItem icon="people-outline" label="Reassign" onPress={() => act(menu, 'reassign')} /> : null}
            {menu.actions.includes('defer') ? <MenuItem icon="time-outline" label="Defer with a reason" onPress={() => act(menu, 'defer')} /> : null}
            {menu.actions.includes('reject') ? <MenuItem icon="close-circle-outline" label="Reject with a reason" danger onPress={() => act(menu, 'reject')} /> : null}
            {menu.actions.includes('reopen') ? <MenuItem icon="refresh-outline" label="Reopen for review" onPress={() => act(menu, 'reopen')} /> : null}
            {menu.actions.includes('accept') ? <MenuItem icon="checkbox-outline" label="Select several" onPress={() => { const r = menu; setMenu(null); pick(r); }} /> : null}
          </>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

function MenuItem({ icon, label, onPress, danger }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.menuItem, pressed && { backgroundColor: COLORS.bgMuted }]}>
      <Ionicons name={icon} size={22} color={danger ? COLORS.danger : COLORS.text} />
      <Text style={[s.menuLabel, danger && { color: COLORS.danger }]}>{label}</Text>
    </Pressable>
  );
}

function Tile({ label, value, active, onPress }: { label: string; value: number; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [s.tile, active && s.tileActive, pressed && { opacity: 0.85 }]}
    >
      <Text style={s.tileValue}>{value}</Text>
      <Text style={s.tileLabel} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function RowSkeleton() {
  return (
    <View style={s.skel}>
      <Skeleton height={16} width="85%" />
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Skeleton height={22} width={70} radius={11} />
        <Skeleton height={22} width={80} radius={11} />
      </View>
      <Skeleton height={22} width={130} radius={11} />
      <Skeleton height={12} width="60%" />
    </View>
  );
}

const s = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: 120 },
  header: { marginBottom: spacing.xs },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.sm, marginBottom: spacing.md },
  tile: { width: '48.5%', backgroundColor: COLORS.text, borderRadius: borderRadius.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, minHeight: 60, justifyContent: 'center', borderWidth: 2, borderColor: COLORS.text },
  tileActive: { borderColor: '#A3A3A3' },
  tileValue: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: COLORS.textOnPrimary, lineHeight: 28 },
  tileLabel: { fontFamily: fontFamily.medium, fontSize: 12, color: '#D4D4D4' },
  note: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', backgroundColor: COLORS.bgMuted, borderRadius: borderRadius.sm, padding: spacing.md, marginBottom: spacing.md },
  noteText: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary },
  search: { marginBottom: 0 },
  chips: { gap: spacing.sm, paddingBottom: spacing.md, alignItems: 'center' },
  tip: { fontFamily: fontFamily.regular, fontSize: 12, color: COLORS.textMuted, marginBottom: spacing.md },
  selectBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44, marginBottom: spacing.sm },
  selectText: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  link: { minHeight: 44, paddingHorizontal: spacing.sm, justifyContent: 'center' },
  linkText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text, textDecorationLine: 'underline' },
  bulk: { flexDirection: 'row', gap: spacing.sm },
  bulkBtn: { flex: 1 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text, textAlign: 'center' },
  emptyBody: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, textAlign: 'center' },
  skel: { backgroundColor: COLORS.surface, borderRadius: borderRadius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, padding: spacing.lg, marginBottom: spacing.md, gap: spacing.sm },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48, paddingHorizontal: spacing.sm, borderRadius: borderRadius.sm },
  menuLabel: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
});
