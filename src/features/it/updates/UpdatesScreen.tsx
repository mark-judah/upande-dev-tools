import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Button } from '@/core/ui/Button';
import { Skeleton } from '@/core/ui/Skeleton';
import { SwipeRow } from '@/core/ui/SwipeRow';
import { Pill } from '@/features/shared/Pill';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/core/theme';
import { itMobile, post } from '@/features/it/shared/it-api';
import { ItGate } from '@/features/it/shared/ItGate';
import { ConfirmSheet } from '@/features/it/shared/ConfirmSheet';
import { ChipRow, Note } from '@/features/it/home/ui';
import { useLive } from '@/features/it/home/useLive';
import { HistorySheet } from './HistorySheet';
import { ResultSheet, type RemindResult } from './ResultSheet';

export type Person = {
  user: string; full_name: string; app: string; installed: string; target: string; bucket: string;
  released_days_ago: number | null; days_unseen: number | null; device: string; team: string; reminded: number; last_reminded: string;
};
type Chase = { rows: Person[]; total: number; counts: Record<string, number> };

const BUCKETS = [
  { key: 'chase', label: 'To chase', buckets: ['forgot', 'cant_update'] },
  { key: 'forgot', label: 'Forgot', buckets: ['forgot'] },
  { key: 'cant_update', label: "Can't update", buckets: ['cant_update'] },
  { key: 'away', label: 'Away', buckets: ['away'] },
  { key: 'current', label: 'Current', buckets: ['current'] },
];
const key = (p: { user: string; app: string }) => `${p.user}|${p.app}`;
const remindable = (p: Person) => p.bucket === 'forgot' || p.bucket === 'cant_update';
const BADGE: Record<string, { label: string; tone: 'warn' | 'danger' | 'neutral' | 'success' }> = {
  forgot: { label: 'Reopen app', tone: 'warn' },
  cant_update: { label: 'Needs install', tone: 'danger' },
  away: { label: 'Away', tone: 'neutral' },
  current: { label: 'Current', tone: 'success' },
};

function Updates() {
  const params = useLocalSearchParams<{ bucket?: string; app?: string }>();
  const [bucket, setBucket] = useState(BUCKETS.some((b) => b.key === params.bucket) ? (params.bucket as string) : 'chase');
  const app = params.app ?? '';
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [sel, setSel] = useState<Record<string, Person>>({});
  const [target, setTarget] = useState<Person[] | null>(null);
  const [result, setResult] = useState<RemindResult | null>(null);
  const [history, setHistory] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timer.current = setTimeout(() => setSearch(text.trim()), 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [text]);

  // The server's "chase" view is its default (no bucket): forgot + cant_update.
  const apiBucket = bucket === 'chase' ? undefined : bucket;
  const { data, loading, error, reload } = useLive<Chase>(
    () => itMobile<Chase>('updates', { app: app || undefined, bucket: apiBucket, search: search || undefined }),
    [bucket, search, app],
  );

  const counts = data?.counts ?? {};
  const chaseN = (counts.forgot ?? 0) + (counts.cant_update ?? 0);
  const countOf = (k: string) => (k === 'chase' ? chaseN : counts[k] ?? 0);
  const selected = Object.values(sel);
  const toggle = (p: Person) => {
    if (!remindable(p)) return;
    setSel((s) => {
      const n = { ...s };
      if (n[key(p)]) delete n[key(p)]; else n[key(p)] = p;
      return n;
    });
  };
  const selecting = selected.length > 0;

  const send = async () => {
    const list = target ?? [];
    const r = await post.mobile<{ results: { user: string; app: string; result: string }[]; sent: number }>('remind', {
      people_list: list.map((p) => ({ user: p.user, app: p.app })),
    });
    const names = Object.fromEntries(list.map((p) => [key(p), p.full_name]));
    setResult({ sent: r.sent, rows: r.results.map((x) => ({ ...x, name: names[key(x)] ?? x.user })) });
    setSel({});
    reload();
  };

  const who = target && target.length === 1 ? target[0].full_name : `${target?.length ?? 0} people`;

  return (
    <Screen
      title="Update chase"
      loading={loading && !data}
      error={!data ? error : null}
      onRetry={reload}
      onRefresh={reload}
      headerRight={<Pressable onPress={() => setHistory(true)} hitSlop={8} style={s.hbtn} accessibilityRole="button" accessibilityLabel="Reminder history"><Ionicons name="time-outline" size={24} color={COLORS.text} /></Pressable>}
      footer={selecting ? (
        <View style={s.bar}>
          <Text style={s.barText}>{selected.length} selected</Text>
          <Button label="Clear" variant="ghost" size="sm" onPress={() => setSel({})} />
          <Button label={`Remind ${selected.length}`} iconLeft="notifications" size="sm" onPress={() => setTarget(selected)} />
        </View>
      ) : undefined}
    >
      <View style={s.search}>
        <Ionicons name="search" size={18} color={COLORS.textMuted} />
        <TextInput value={text} onChangeText={(v) => { setText(v); setSel({}); }} placeholder="Search name, email or team" placeholderTextColor={COLORS.textMuted} style={s.input} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Search people" />
        {text ? <Pressable onPress={() => setText('')} hitSlop={10} accessibilityLabel="Clear search"><Ionicons name="close-circle" size={18} color={COLORS.textMuted} /></Pressable> : null}
      </View>
      <ChipRow value={bucket} onChange={(k) => { setBucket(k); setSel({}); }} items={BUCKETS.map((b) => ({ key: b.key, label: `${b.label} ${data ? countOf(b.key) : ''}`.trim() }))} />
      {app ? <Text style={s.filter}>Only {app}</Text> : null}

      {!data ? (
        <View style={{ gap: spacing.sm }} accessibilityLabel="Loading people">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} height={76} radius={borderRadius.md} />)}</View>
      ) : data.rows.length === 0 ? (
        <Card>
          <Text style={s.eT}>{search ? 'Nobody matches that search.' : bucket === 'chase' ? 'Nobody to chase. Everyone is up to date.' : 'Nobody here.'}</Text>
          <Text style={s.eB}>{bucket === 'chase' && chaseN === 0 ? `${counts.away ?? 0} people are away and ${counts.current ?? 0} are current.` : 'Try another filter.'}</Text>
        </Card>
      ) : (
        <>
          {data.rows.map((p) => {
            const b = BADGE[p.bucket] ?? BADGE.away;
            const on = !!sel[key(p)];
            const can = remindable(p);
            return (
              <View key={key(p)} style={{ marginBottom: spacing.sm }}>
                <SwipeRow radius={borderRadius.md} disabled={!can || selecting} swipeRight={{ label: 'Remind', icon: 'notifications', color: '#052E16', onTrigger: () => setTarget([p]) }}>
                  <Pressable
                    onPress={() => (selecting ? toggle(p) : undefined)}
                    onLongPress={() => toggle(p)}
                    delayLongPress={300}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${p.full_name}, ${p.app}, on ${p.installed || 'unknown'}, ${b.label}${can ? '. Long press to select, swipe right to remind' : ''}`}
                    style={[s.row, on && s.rowOn]}
                  >
                    {selecting && can ? <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? COLORS.text : COLORS.textMuted} /> : null}
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={s.name} numberOfLines={1}>{p.full_name}</Text>
                      <Text style={s.sub} numberOfLines={1}>{p.app.replace(/^Upande /, '')} · v{p.installed || '?'} to v{p.target || '?'}{p.released_days_ago != null ? ` · ${p.released_days_ago}d` : ''}</Text>
                      <Text style={s.sub} numberOfLines={1}>{p.team || p.device || p.user}{p.reminded ? ` · reminded ${p.reminded}x` : ''}</Text>
                    </View>
                    <Pill label={b.label} tone={b.tone} />
                  </Pressable>
                </SwipeRow>
              </View>
            );
          })}
          {data.total > data.rows.length ? <Note>{`Showing ${data.rows.length} of ${data.total}. Search to narrow it down.`}</Note> : null}
          <Note>Swipe right to remind one person. Long press to select several. A person can be reminded once every 20 hours.</Note>
        </>
      )}

      <ConfirmSheet
        visible={!!target}
        onClose={() => setTarget(null)}
        title="Send update reminder"
        consequence={`${who} will get a push notification now asking them to update${target && target.length === 1 ? ` ${target[0].app}` : ''}. Anyone reminded in the last 20 hours is skipped.`}
        confirmLabel={`Send to ${target?.length ?? 0}`}
        onConfirm={send}
      />
      <ResultSheet result={result} onClose={() => setResult(null)} />
      <HistorySheet visible={history} onClose={() => setHistory(false)} app={app} />
    </Screen>
  );
}

export default function UpdatesScreen() {
  return (
    <ItGate title="Update chase">
      <Updates />
    </ItGate>
  );
}

const s = StyleSheet.create({
  hbtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: COLORS.bgMuted, borderRadius: borderRadius.full, paddingHorizontal: spacing.lg, minHeight: 44, marginBottom: spacing.md },
  input: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text, minHeight: 44 },
  filter: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: COLORS.surface, borderRadius: borderRadius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, padding: spacing.md, minHeight: 72 },
  rowOn: { borderColor: COLORS.text, backgroundColor: COLORS.bgMuted },
  name: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  eT: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  eB: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, marginTop: 4 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, backgroundColor: COLORS.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  barText: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
});
