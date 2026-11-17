import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Screen } from '@/core/ui/Screen';
import { Button } from '@/core/ui/Button';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { Input } from '@/core/ui/Input';
import { Segmented } from '@/core/ui/Segmented';
import { Skeleton } from '@/core/ui/Skeleton';
import { showDialog } from '@/core/ui/DialogHost';
import { useToast } from '@/core/ui/Toast';
import { call } from '@/core/api/call';
import { mapAxiosError } from '@/core/api/client';
import { useAuthStore } from '@/core/auth/store';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { useLoad } from '@/features/shared/useLoad';
import { useCaptureUi } from '@/features/capture/capture-ui';
import { RequestRowCard } from './RequestRowCard';
import {
  canWithdraw,
  isThisMonth,
  matchesStatus,
  priorityRank,
  type RequestRow,
  type Scope,
  type SortKey,
  type StatusFilter,
} from './model';

const REVIEWER_ROLES = ['Projects Manager', 'System Manager'];

const STATUS_CHIPS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
  { value: 'closed', label: 'Rejected / Deferred' },
];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const openCapture = () => useCaptureUi.getState().setOpen(true);

export function RequestsScreen() {
  const email = useAuthStore((st) => st.email);
  const roles = useAuthStore((st) => st.roles);
  const toast = useToast();
  const isReviewer = roles.some((r) => REVIEWER_ROLES.includes(r));

  const { data, loading, error, reload } = useLoad(() =>
    call<RequestRow[]>('requests.get_my_requests', {}, true),
  );
  const [scope, setScope] = useState<Scope>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim().toLowerCase(), 250);

  const isMine = useCallback(
    (r: RequestRow) => !!email && r.owner.toLowerCase() === email.toLowerCase(),
    [email],
  );

  const all = useMemo(() => data ?? [], [data]);
  const scoped = useMemo(() => (scope === 'mine' ? all.filter(isMine) : all), [all, scope, isMine]);

  const stats = useMemo(() => {
    let waiting = 0;
    let progress = 0;
    let done = 0;
    for (const r of scoped) {
      if (r.workflow_state === 'Under Review') waiting++;
      else if (['Approved', 'Scheduled', 'In Progress'].includes(r.workflow_state)) progress++;
      else if (['Completed', 'Closed'].includes(r.workflow_state) && isThisMonth(r.creation)) done++;
    }
    return { waiting, progress, done };
  }, [scoped]);
  const toReview = useMemo(() => all.filter((r) => r.workflow_state === 'Under Review').length, [all]);

  const rows = useMemo(() => {
    const list = scoped.filter(
      (r) =>
        matchesStatus(r.workflow_state, status) &&
        (!q || r.title.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)),
    );
    if (sort === 'priority') {
      return [...list].sort(
        (a, b) => priorityRank(a.priority) - priorityRank(b.priority) || b.creation.localeCompare(a.creation),
      );
    }
    return list; // server order is newest first
  }, [scoped, status, q, sort]);

  const withdraw = useCallback(
    (r: RequestRow) => {
      showDialog('Withdraw this request?', `"${r.title}" will be closed as Withdrawn.`, [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            try {
              await call('requests.withdraw_request', { name: r.name });
              toast.showSuccess('Request withdrawn');
              await reload();
            } catch (e) {
              toast.showError(mapAxiosError(e).message);
            }
          },
        },
      ]);
    },
    [reload, toast],
  );

  const openMenu = useCallback(
    (r: RequestRow) => {
      if (!canWithdraw(r, email)) return;
      showDialog(r.title, `${r.name} · ${r.workflow_state}`, [
        { text: 'Open', onPress: () => router.push(`/request/${r.name}` as never) },
        { text: 'Withdraw request', style: 'destructive', onPress: () => withdraw(r) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [email, withdraw],
  );

  const filtered = status !== 'all' || !!q;

  const header = (
    <View style={s.header}>
      <View style={s.tiles}>
        <StatTile label="Waiting" value={stats.waiting} onPress={() => setStatus('open')} />
        <StatTile label="In progress" value={stats.progress} onPress={() => setStatus('open')} />
        <StatTile label="Done (month)" value={stats.done} onPress={() => setStatus('done')} />
      </View>

      {isReviewer ? (
        <Pressable
          onPress={() => router.push('/review-queue' as never)}
          style={s.banner}
          accessibilityRole="button"
          accessibilityLabel={`Triage queue, ${toReview} waiting for a decision`}
        >
          <View style={s.bannerBadge}><Text style={s.bannerCount}>{toReview}</Text></View>
          <View style={s.bannerBody}>
            <Text style={s.bannerText}>{toReview > 0 ? 'Triage queue' : 'Queue is clear'}</Text>
            <Text style={s.bannerSub} numberOfLines={1}>
              {toReview > 0 ? 'Swipe right to accept, left to defer' : 'Nothing is waiting for a decision'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textOnPrimary} />
        </Pressable>
      ) : null}

      <Segmented
        value={scope}
        onChange={setScope}
        options={[
          { value: 'all', label: `All (${all.length})` },
          { value: 'mine', label: `Mine (${all.filter(isMine).length})` },
        ]}
      />

      <Input
        value={query}
        onChangeText={setQuery}
        placeholder="Search requests"
        returnKeyType="search"
        autoCorrect={false}
        clearButtonMode="while-editing"
        accessibilityLabel="Search requests"
        style={s.search}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {STATUS_CHIPS.map((c) => (
          <DecisionChip key={c.value} label={c.label} selected={status === c.value} onPress={() => setStatus(c.value)} />
        ))}
        <View style={s.divider} />
        <DecisionChip
          label={sort === 'newest' ? 'Sort: Newest' : 'Sort: Priority'}
          selected={false}
          onPress={() => setSort(sort === 'newest' ? 'priority' : 'newest')}
        />
      </ScrollView>
    </View>
  );

  const empty = (
    <View style={s.empty}>
      <Ionicons name={filtered ? 'search-outline' : 'chatbubbles-outline'} size={40} color={COLORS.textMuted} />
      <Text style={s.emptyTitle}>
        {filtered ? 'Nothing matches' : scope === 'mine' ? "You haven't raised anything yet" : 'No requests yet'}
      </Text>
      <Text style={s.emptyBody}>
        {filtered
          ? 'Try another status or clear the search.'
          : 'Ask for a feature, report a bug or pose a question. You can follow it here.'}
      </Text>
      {filtered ? (
        <Button label="Clear filters" variant="outline" onPress={() => { setStatus('all'); setQuery(''); }} />
      ) : (
        <Button label="Raise a request" iconLeft="add" onPress={openCapture} />
      )}
    </View>
  );

  return (
    <Screen
      tab
      title="Requests"
      scroll={false}
      contentPadded={false}
      error={error && !data ? error : null}
      onRetry={reload}
      headerRight={
        <Pressable onPress={openCapture} style={s.add} accessibilityRole="button" accessibilityLabel="Raise a request">
          <Ionicons name="add" size={26} color={COLORS.text} />
        </Pressable>
      }
    >
      {loading && !data ? (
        <View style={s.list}>
          {header}
          {[0, 1, 2, 3].map((i) => <RowSkeleton key={i} />)}
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.name}
          renderItem={({ item }) => (
            <RequestRowCard
              item={item}
              mine={isMine(item)}
              onPress={() => router.push(`/request/${item.name}` as never)}
              onMenu={canWithdraw(item, email) ? () => openMenu(item) : undefined}
            />
          )}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          contentContainerStyle={s.list}
          refreshing={loading}
          onRefresh={reload}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          initialNumToRender={8}
          windowSize={7}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}

function StatTile({ label, value, onPress, active }: { label: string; value: number; onPress: () => void; active?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${value} ${label}`}
      style={({ pressed }) => [s.tile, active && s.tileActive, pressed && { opacity: 0.85 }]}
    >
      <Text style={s.tileValue}>{value}</Text>
      <Text style={s.tileLabel} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function RowSkeleton() {
  return (
    <View style={[s.skel]}>
      <Skeleton height={16} width="85%" />
      <Skeleton height={16} width="55%" />
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <Skeleton height={22} width={90} radius={11} />
        <Skeleton height={22} width={60} radius={11} />
      </View>
      <Skeleton height={4} />
      <Skeleton height={12} width="40%" />
    </View>
  );
}

const s = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: 120 },
  header: { marginBottom: spacing.xs },
  tiles: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  tile: { flex: 1, backgroundColor: COLORS.text, borderRadius: borderRadius.lg, paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md, minHeight: 60, justifyContent: 'center' },
  tileActive: { borderWidth: 2, borderColor: COLORS.textMuted },
  tileValue: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: COLORS.textOnPrimary, lineHeight: 28 },
  tileLabel: { fontFamily: fontFamily.medium, fontSize: 12, color: '#D4D4D4' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64, backgroundColor: COLORS.text, borderRadius: borderRadius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginBottom: spacing.md },
  bannerBadge: { minWidth: 36, height: 36, borderRadius: 18, backgroundColor: '#F59E0B', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  bannerCount: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: COLORS.text },
  bannerBody: { flex: 1 },
  bannerText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.textOnPrimary },
  bannerSub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: '#D4D4D4' },
  search: { marginBottom: 0 },
  chips: { gap: spacing.sm, paddingBottom: spacing.md, alignItems: 'center' },
  divider: { width: 1, height: 24, backgroundColor: COLORS.border },
  add: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text, textAlign: 'center' },
  emptyBody: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, textAlign: 'center', marginBottom: spacing.md },
  skel: { backgroundColor: COLORS.surface, borderRadius: borderRadius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, padding: spacing.lg, marginBottom: spacing.md, gap: spacing.sm },
});
