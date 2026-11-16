import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Screen } from '@/core/ui/Screen';
import { Skeleton } from '@/core/ui/Skeleton';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { Pill } from '@/features/shared/Pill';
import { useLoad } from '@/features/shared/useLoad';
import { ItGate } from '../shared/ItGate';
import { itMobile } from '../shared/it-api';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { ago, apiId, waitTone, type Inbox, type InboxRow } from './model';

export function SupportScreen() {
  return (
    <ItGate title="Support">
      <InboxList />
    </ItGate>
  );
}

function InboxList() {
  const { data, loading, error, reload } = useLoad<Inbox>(() => itMobile<Inbox>('inbox'));
  const [query, setQuery] = useState('');
  const [app, setApp] = useState('');
  const [status, setStatus] = useState('');
  const [onlyWaiting, setOnlyWaiting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const apps = useMemo(() => Array.from(new Set(rows.map((r) => r.app).filter(Boolean))).sort(), [rows]);
  const statuses = useMemo(() => (data?.statuses?.length ? data.statuses : Array.from(new Set(rows.map((r) => r.status)))), [data, rows]);
  const shown = useMemo(() => {
    const t = query.trim().toLowerCase();
    return rows.filter((r) =>
      (!app || r.app === app) && (!status || r.status === status) && (!onlyWaiting || r.waiting) &&
      (!t || `${r.subject} ${r.person} ${r.preview} ${r.doctype ?? ''}`.toLowerCase().includes(t)));
  }, [rows, app, status, onlyWaiting, query]);

  const open = (r: InboxRow) => router.push(`/it/support/${apiId(r.id)}` as never);

  const header = (
    <View style={s.header}>
      <View style={s.counts}>
        <View style={s.tile}>
          <Text style={s.tileN}>{data?.waiting ?? 0}</Text>
          <Text style={s.tileL}>Waiting for you</Text>
        </View>
        <View style={[s.tile, { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }]}>
          <Text style={[s.tileN, { color: COLORS.text }]}>{rows.length}</Text>
          <Text style={[s.tileL, { color: COLORS.textMuted }]}>Conversations</Text>
        </View>
      </View>
      <View style={s.search}>
        <Ionicons name="search" size={18} color={COLORS.textMuted} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search person, subject, message" placeholderTextColor={COLORS.textMuted} style={s.input} autoCapitalize="none" autoCorrect={false} returnKeyType="search" accessibilityLabel="Search conversations" />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
        <DecisionChip label="Waiting only" selected={onlyWaiting} onPress={() => setOnlyWaiting((v) => !v)} />
        {statuses.map((st) => <DecisionChip key={st} label={st} selected={status === st} onPress={() => setStatus(status === st ? '' : st)} />)}
      </ScrollView>
      {apps.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
          <DecisionChip label="All apps" selected={!app} onPress={() => setApp('')} />
          {apps.map((a) => <DecisionChip key={a} label={a.replace(/^Upande /, '')} selected={app === a} onPress={() => setApp(app === a ? '' : a)} />)}
        </ScrollView>
      ) : null}
    </View>
  );

  return (
    <Screen title="Support" scroll={false} contentPadded={false} error={!data && error ? error : null} onRetry={reload}>
      {loading && !data ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Skeleton height={72} radius={borderRadius.md} />
          <Skeleton height={48} radius={borderRadius.full} />
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={92} radius={borderRadius.md} />)}
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(r) => r.id}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await reload(); setRefreshing(false); }} tintColor={COLORS.text} colors={[COLORS.text]} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="chatbubbles-outline" size={40} color={COLORS.textMuted} />
              <Text style={s.emptyT}>{rows.length ? 'No conversations match' : 'Inbox zero'}</Text>
              <Text style={s.emptyB}>{rows.length ? 'Clear a filter or change the search.' : 'Nobody is waiting on you.'}</Text>
            </View>
          }
          renderItem={({ item }) => <InboxCard r={item} onPress={open} />}
        />
      )}
    </Screen>
  );
}

function InboxCard({ r, onPress }: { r: InboxRow; onPress: (r: InboxRow) => void }) {
  const w = waitTone(r.waiting_hours);
  const access = r.kind === 'access';
  return (
    <Pressable
      onPress={() => onPress(r)}
      accessibilityRole="button"
      accessibilityLabel={`${r.person}, ${r.subject}, ${r.status}${r.waiting ? `, waiting ${w.label}` : ''}`}
      style={({ pressed }) => [s.card, pressed && { backgroundColor: COLORS.bgMuted }]}
    >
      <View style={s.cardTop}>
        <View style={s.avatar}>
          <Ionicons name={access ? 'key-outline' : 'chatbubble-ellipses-outline'} size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.person} numberOfLines={1}>{r.person || 'Unknown'}</Text>
          <Text style={s.meta} numberOfLines={1}>{access ? `Access to ${r.doctype}` : r.subject}{r.app && !access ? ` · ${r.app}` : ''}</Text>
        </View>
        {r.waiting ? (
          <View style={[s.wait, { backgroundColor: w.bg }]} accessibilityLabel={`Waiting ${w.label}`}>
            <Ionicons name="time-outline" size={13} color={w.fg} />
            <Text style={[s.waitT, { color: w.fg }]}>{w.label}</Text>
          </View>
        ) : null}
      </View>
      {r.preview ? <Text style={s.preview} numberOfLines={2}>{r.preview}</Text> : null}
      <View style={s.foot}>
        <Pill label={r.status} tone={r.status === 'Open' ? 'warn' : r.status === 'Resolved' || r.status === 'Closed' ? 'success' : 'neutral'} />
        {access && r.ptypes ? <Pill label={r.ptypes.replace(/[\[\]"]/g, '')} tone="info" /> : null}
        <View style={{ flex: 1 }} />
        <Text style={s.meta}>{ago(r.last_activity)}</Text>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  header: { padding: spacing.lg, gap: spacing.md },
  counts: { flexDirection: 'row', gap: spacing.md },
  tile: { flex: 1, backgroundColor: COLORS.text, borderRadius: borderRadius.lg, padding: spacing.lg, gap: 2 },
  tileN: { fontFamily: fontFamily.bold, fontSize: fontSize.xxl, color: '#fff' },
  tileL: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: '#D4D4D4' },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md, backgroundColor: COLORS.surface, borderRadius: borderRadius.full, borderWidth: 1, borderColor: COLORS.border },
  input: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text, minHeight: 44 },
  strip: { gap: spacing.sm, paddingRight: spacing.lg },
  card: { marginHorizontal: spacing.lg, marginBottom: spacing.md, backgroundColor: COLORS.surface, borderRadius: borderRadius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, padding: spacing.lg, gap: spacing.sm },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.text, alignItems: 'center', justifyContent: 'center' },
  person: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  meta: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  preview: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.textSecondary, lineHeight: 21 },
  wait: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: borderRadius.full },
  waitT: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs },
  foot: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xxl },
  emptyT: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text },
  emptyB: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.textMuted },
});
