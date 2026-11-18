import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Button } from '@/core/ui/Button';
import { Segmented } from '@/core/ui/Segmented';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { Skeleton } from '@/core/ui/Skeleton';
import { BottomSheet } from '@/core/ui/Dialog';
import { Input } from '@/core/ui/Input';
import { useToast } from '@/core/ui/Toast';
import { mapAxiosError } from '@/core/api/client';
import { Pill } from '@/features/shared/Pill';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/core/theme';
import { dutyApi, DutyUnavailable } from './duty-api';
import {
  formatRange,
  isOn,
  localDay,
  nextDutyFor,
  requestSummary,
  slotTitle,
  slotWhen,
  weekday,
  type ChangeRequest,
  type DutyType,
  type Rota,
  type Slot,
} from './duty-model';
import { SlotSheet, type SheetMode } from './SlotSheet';

type Tab = 'rota' | 'requests';
type Data = { rota: Rota; requests: ChangeRequest[] };

const STATUS_TONE: Record<string, 'warn' | 'success' | 'danger' | 'neutral'> = { Pending: 'warn', Approved: 'success', Rejected: 'danger', Cancelled: 'neutral' };

/**
 * The duty rota for any duty type (Support first): who is on when, your next duty, swap and cover requests, and the
 * PM's approvals. PMs (`can_manage` from the server) also add, edit and delete slots.
 */
export function DutyScreen() {
  const params = useLocalSearchParams<{ tab?: string; type?: string }>();
  const toast = useToast();
  const [types, setTypes] = useState<DutyType[] | null>(null);
  const [type, setType] = useState<string | null>(typeof params.type === 'string' ? params.type : null);
  const [tab, setTab] = useState<Tab>(params.tab === 'requests' ? 'requests' : 'rota');
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [sheet, setSheet] = useState<SheetMode | null>(null);
  const [rejecting, setRejecting] = useState<ChangeRequest | null>(null);
  const seq = useRef(0);
  const [today, setToday] = useState(() => localDay(new Date()));

  // Midnight passes while the screen is open: "Now" moves with it.
  useEffect(() => {
    const id = setInterval(() => setToday(localDay(new Date())), 60000);
    return () => clearInterval(id);
  }, []);

  const loadTypes = useCallback(async () => {
    try {
      const t = await dutyApi.types();
      setTypes(t);
      setUnavailable(false);
      setType((cur) => (cur && t.some((x) => x.name === cur) ? cur : (t.find((x) => x.name === 'Support') ?? t[0])?.name ?? null));
      if (!t.length) setLoading(false);
    } catch (e) {
      setLoading(false);
      if (e instanceof DutyUnavailable) setUnavailable(true);
      else setError(mapAxiosError(e).message);
    }
  }, []);

  // Latest wins: switching duty type while a load is in flight never shows the old type's rota.
  const load = useCallback(async (t: string) => {
    const mine = ++seq.current;
    setError(null);
    try {
      const [rota, requests] = await Promise.all([dutyApi.rota(t), dutyApi.requests(t).catch(() => [] as ChangeRequest[])]);
      if (mine !== seq.current) return;
      setData({ rota, requests });
    } catch (e) {
      if (mine !== seq.current) return;
      if (e instanceof DutyUnavailable) setUnavailable(true);
      else setError(mapAxiosError(e).message);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  // Deferred a tick (as elsewhere in the app) so no state is set synchronously inside the effect.
  useEffect(() => {
    const t = setTimeout(() => void loadTypes(), 0);
    return () => clearTimeout(t);
  }, [loadTypes]);

  useEffect(() => {
    if (!type) return;
    const t = setTimeout(() => void load(type), 0);
    return () => clearTimeout(t);
  }, [type, load]);

  const pickType = (t: string) => {
    if (t === type) return;
    setData(null);
    setLoading(true);
    setType(t);
  };

  const reload = useCallback(() => {
    if (type) void load(type);
    else void loadTypes();
  }, [type, load, loadTypes]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      if (type) await load(type);
      else await loadTypes();
    } finally {
      setRefreshing(false);
    }
  };

  const me = data?.rota.me ?? '';
  const canManage = !!data?.rota.can_manage;
  const slots = useMemo(() => data?.rota.slots ?? [], [data]);
  const shown = useMemo(() => (showPast ? slots : slots.filter((s) => s.end_date >= today)), [slots, showPast, today]);
  const pastCount = slots.length - slots.filter((s) => s.end_date >= today).length;
  const pendingBySlot = useMemo(() => {
    const m = new Set<string>();
    (data?.requests ?? []).forEach((r) => {
      if (r.status !== 'Pending') return;
      m.add(r.slot);
      if (r.swap_slot) m.add(r.swap_slot);
    });
    return m;
  }, [data]);
  const requests = data?.requests ?? [];
  const pending = requests.filter((r) => r.status === 'Pending');
  const next = me ? nextDutyFor(slots, me, today) : null;

  const openSlot = useCallback((s: Slot) => setSheet({ kind: 'view', slot: s }), []);

  const decide = async (r: ChangeRequest, approve: boolean, note?: string) => {
    try {
      await dutyApi.decide(r.name, approve, note);
      toast.showSuccess(approve ? 'Approved. The rota is updated.' : 'Rejected');
      reload();
    } catch (e) {
      toast.showError(mapAxiosError(e).message);
      reload();
    }
  };
  const cancel = async (r: ChangeRequest) => {
    try {
      await dutyApi.cancel(r.name);
      toast.showInfo('Request cancelled');
      reload();
    } catch (e) {
      toast.showError(mapAxiosError(e).message);
    }
  };

  const header = (
    <View style={s.header}>
      {types && types.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
          {types.map((t) => (
            <DecisionChip key={t.name} label={t.duty_name} selected={type === t.name} onPress={() => pickType(t.name)} />
          ))}
        </ScrollView>
      ) : null}
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'rota', label: 'Rota' },
          { value: 'requests', label: pending.length ? `Requests (${pending.length})` : 'Requests' },
        ]}
      />
      {tab === 'rota' && data ? (
        <>
          {me ? (
            <Card style={{ marginBottom: 0 }}>
              <Text style={s.kicker}>Your next duty</Text>
              <Text style={s.nextTitle}>{next ? slotTitle(next) : 'None scheduled'}</Text>
              {next ? (
                <Text style={s.muted}>
                  {next.label ? `${rangeText(next)} · ` : ''}
                  {slotWhen(next, today) === 'current' ? 'on now' : 'upcoming'} · with {next.assignees.filter((a) => a.user !== me).map((a) => a.full_name).join(', ') || 'nobody else'}
                </Text>
              ) : null}
            </Card>
          ) : null}
          <View style={s.rowBetween}>
            {pastCount > 0 ? <DecisionChip label={showPast ? `Hide past (${pastCount})` : `Show past (${pastCount})`} selected={showPast} onPress={() => setShowPast((v) => !v)} /> : <View />}
            {canManage ? <Button label="Add slot" iconLeft="add" size="sm" variant="outline" onPress={() => setSheet({ kind: 'edit', slot: null })} /> : null}
          </View>
        </>
      ) : null}
    </View>
  );

  const typeName = types?.find((t) => t.name === type)?.duty_name ?? 'Duty';

  return (
    <Screen title="Duty rota" scroll={false} contentPadded={false}>
      {unavailable ? (
        <View style={s.center}>
          <Ionicons name="calendar-outline" size={40} color={COLORS.textMuted} />
          <Text style={s.emptyTitle}>Not on this server yet</Text>
          <Text style={s.emptyBody}>The duty rota needs the latest Upande Dev Tools on the server. Once it is installed, the support rota shows here.</Text>
          <Button label="Check again" onPress={() => { setUnavailable(false); setLoading(true); void loadTypes(); }} style={{ alignSelf: 'stretch' }} />
        </View>
      ) : error && !data ? (
        <View style={s.center}>
          <Text style={s.emptyTitle}>Could not load the rota</Text>
          <Text style={s.emptyBody}>{error}</Text>
          <Button label="Try again" onPress={reload} style={{ alignSelf: 'stretch' }} />
        </View>
      ) : types && types.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="calendar-outline" size={40} color={COLORS.textMuted} />
          <Text style={s.emptyTitle}>No duty types yet</Text>
          <Text style={s.emptyBody}>Add one (for example Support) under Master Data on the Dev Tools dashboard.</Text>
        </View>
      ) : tab === 'rota' ? (
        <FlatList
          data={loading && !data ? [] : shown}
          keyExtractor={(x) => x.name}
          ListHeaderComponent={header}
          contentContainerStyle={s.list}
          initialNumToRender={10}
          windowSize={9}
          removeClippedSubviews={Platform.OS === 'android'}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.text} colors={[COLORS.text]} />}
          ListEmptyComponent={
            loading && !data ? (
              <View style={{ gap: spacing.sm }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={84} />)}</View>
            ) : (
              <Card><Text style={s.muted}>{slots.length ? 'No upcoming slots. Show past to see earlier ones.' : `No ${typeName.toLowerCase()} slots yet.${canManage ? ' Add the first one.' : ''}`}</Text></Card>
            )
          }
          renderItem={({ item }) => <SlotCard slot={item} me={me} today={today} pending={pendingBySlot.has(item.name)} onPress={openSlot} />}
        />
      ) : (
        <FlatList
          data={loading && !data ? [] : requests}
          keyExtractor={(r) => r.name}
          ListHeaderComponent={header}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.text} colors={[COLORS.text]} />}
          ListEmptyComponent={
            loading && !data ? (
              <View style={{ gap: spacing.sm }}>{[0, 1].map((i) => <Skeleton key={i} height={96} />)}</View>
            ) : (
              <Card><Text style={s.muted}>No requests. Open a slot you are on to ask for a swap or cover.</Text></Card>
            )
          }
          renderItem={({ item: r }) => (
            <Card>
              <View style={s.rowBetween}>
                <Text style={s.reqTitle} numberOfLines={3}>{requestSummary(r)}</Text>
                <Pill label={r.status} tone={STATUS_TONE[r.status] ?? 'neutral'} />
              </View>
              {r.reason ? <Text style={s.body}>“{r.reason}”</Text> : null}
              <Text style={s.muted}>
                Asked by {r.requested_by_name || r.requested_by}
                {r.decided_by_name ? ` · ${r.status.toLowerCase()} by ${r.decided_by_name}` : ''}
                {r.decision_note ? ` · ${r.decision_note}` : ''}
              </Text>
              {r.status === 'Pending' ? (
                <View style={s.actions}>
                  {canManage ? <Button label="Approve" size="sm" iconLeft="checkmark" onPress={() => void decide(r, true)} /> : null}
                  {canManage ? <Button label="Reject" size="sm" variant="outline" onPress={() => setRejecting(r)} /> : null}
                  {r.requested_by === me || (!canManage && (r.from_user === me)) ? <Button label="Cancel request" size="sm" variant="ghost" onPress={() => void cancel(r)} /> : null}
                </View>
              ) : null}
            </Card>
          )}
        />
      )}

      <SlotSheet
        mode={sheet}
        onClose={() => setSheet(null)}
        setMode={setSheet}
        slots={slots}
        dutyType={type ?? ''}
        me={me}
        canManage={canManage}
        today={today}
        onChanged={reload}
      />
      <RejectSheet request={rejecting} onClose={() => setRejecting(null)} onReject={(r, note) => decide(r, false, note)} />
    </Screen>
  );
}

function rangeText(s: Slot): string {
  return s.start_date === s.end_date ? `${weekday(s.start_date)} ${formatRange(s.start_date, s.end_date)}` : formatRange(s.start_date, s.end_date);
}

const SlotCard = memo(function SlotCard({ slot, me, today, pending, onPress }: { slot: Slot; me: string; today: string; pending: boolean; onPress: (s: Slot) => void }) {
  const when = slotWhen(slot, today);
  const mine = !!me && isOn(slot, me);
  return (
    <Card onPress={() => onPress(slot)} style={when === 'past' ? { opacity: 0.6 } : undefined} accessibilityLabel={`${slotTitle(slot)}, ${slot.assignees.map((a) => a.full_name).join(', ') || 'nobody'}${mine ? ', you are on duty' : ''}`}>
      <View style={s.rowBetween}>
        <View style={{ flex: 1 }}>
          <Text style={s.slotTitle} numberOfLines={1}>{slotTitle(slot)}</Text>
          {slot.label ? <Text style={s.muted}>{rangeText(slot)}</Text> : slot.start_date === slot.end_date ? <Text style={s.muted}>{weekday(slot.start_date)}</Text> : null}
        </View>
        {when === 'current' ? <Pill label="Now" tone="success" /> : null}
        {pending ? <Pill label="Change pending" tone="warn" /> : null}
      </View>
      <View style={s.names}>
        {slot.assignees.length === 0 ? <Text style={s.muted}>Nobody assigned</Text> : null}
        {slot.assignees.map((a) => (
          <View key={a.user} style={[s.name, a.user === me && s.nameMe]}>
            <Text style={[s.nameText, a.user === me && s.nameTextMe]} numberOfLines={1}>{a.full_name}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
});

function RejectSheet({ request, onClose, onReject }: { request: ChangeRequest | null; onClose: () => void; onReject: (r: ChangeRequest, note?: string) => Promise<void> }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <BottomSheet visible={!!request} onClose={onClose} busy={busy} title="Reject request" subtitle={request ? requestSummary(request) : undefined}>
      <Input label="Why (optional, shown to them)" value={note} onChangeText={setNote} maxLength={300} />
      <Button
        label="Reject"
        color={COLORS.danger}
        loading={busy}
        onPress={async () => {
          if (!request) return;
          setBusy(true);
          await onReject(request, note.trim() || undefined);
          setBusy(false);
          setNote('');
          onClose();
        }}
      />
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { gap: spacing.md, marginBottom: spacing.md },
  strip: { gap: spacing.sm, paddingRight: spacing.lg },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  kicker: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted },
  nextTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text, marginTop: 2 },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary, marginTop: spacing.xs },
  slotTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  names: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm },
  name: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.full, backgroundColor: COLORS.bgMuted },
  nameMe: { backgroundColor: COLORS.text },
  nameText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text },
  nameTextMe: { color: '#fff' },
  reqTitle: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  emptyTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text, textAlign: 'center' },
  emptyBody: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.textMuted, textAlign: 'center' },
});
