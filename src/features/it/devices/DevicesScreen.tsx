import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Screen } from '@/core/ui/Screen';
import { Skeleton } from '@/core/ui/Skeleton';
import { Button } from '@/core/ui/Button';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { SwipeRow } from '@/core/ui/SwipeRow';
import { useToast } from '@/core/ui/Toast';
import { useLoad } from '@/features/shared/useLoad';
import { ItGate } from '../shared/ItGate';
import { ConfirmSheet } from '../shared/ConfirmSheet';
import { itMobile, post } from '../shared/it-api';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { DeviceCard } from './DeviceCard';
import { HEALTH, matches, type DeviceRow, type DeviceState, type Fleet, type Health } from './model';

type Item = { kind: 'head'; key: string; title: string; count: number } | { kind: 'dev'; key: string; d: DeviceRow };

export function DevicesScreen() {
  return (
    <ItGate title="Devices">
      <FleetList />
    </ItGate>
  );
}

function FleetList() {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad<Fleet>(() => itMobile<Fleet>('device_list'));
  const [query, setQuery] = useState('');
  const [app, setApp] = useState('');
  const [state, setState] = useState<'' | DeviceState>('');
  const [health, setHealth] = useState<Health | ''>('');
  const [grouped, setGrouped] = useState(false);
  const [over, setOver] = useState<Record<string, DeviceState>>({});
  const [lost, setLost] = useState<DeviceRow | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const pending = useRef(new Set<string>());

  const rows = useMemo(() => (data?.rows ?? []).map((r) => (over[r.id] ? { ...r, state: over[r.id] } : r)), [data, over]);
  const apps = useMemo(() => Array.from(new Set(rows.map((r) => r.app))).sort(), [rows]);

  const shown = useMemo(
    () => rows.filter((r) => (!app || r.app === app) && (!state || r.state === state) && (!health || r.flags.includes(health)) && matches(r, query)),
    [rows, app, state, health, query],
  );

  const items = useMemo<Item[]>(() => {
    if (!grouped) return shown.map((d) => ({ kind: 'dev', key: d.id, d }));
    const by = new Map<string, DeviceRow[]>();
    shown.forEach((d) => by.set(d.device, [...(by.get(d.device) ?? []), d]));
    return Array.from(by.entries())
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .flatMap(([model, list]): Item[] => [
        { kind: 'head', key: `h:${model}`, title: model, count: list.length },
        ...list.map((d): Item => ({ kind: 'dev', key: d.id, d })),
      ]);
  }, [shown, grouped]);

  const open = useCallback((d: DeviceRow) => router.push(`/it/device/${d.id}` as never), []);

  const setDeviceState = useCallback(async (d: DeviceRow, next: DeviceState) => {
    const was = d.state;
    setOver((o) => ({ ...o, [d.id]: next }));
    pending.current.add(d.id);
    try {
      await post.mobile('set_device', { id: d.id, state: next });
      toast.showSuccess(`${d.device} marked ${next}`, {
        action: { label: 'Undo', onPress: () => { post.mobile('set_device', { id: d.id, state: was }).catch(() => {}); setOver((o) => ({ ...o, [d.id]: was })); } },
      });
    } catch (e) {
      setOver((o) => ({ ...o, [d.id]: was }));
      throw e;
    } finally {
      pending.current.delete(d.id);
    }
  }, [toast]);

  const refresh = async () => {
    setRefreshing(true);
    await reload();
    setOver({});
    setRefreshing(false);
  };

  const header = (
    <View style={s.header}>
      <View style={s.search}>
        <Ionicons name="search" size={18} color={COLORS.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Model, person, serial, MAC, IP"
          placeholderTextColor={COLORS.textMuted}
          style={s.input}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search devices"
        />
        {query ? (
          <Ionicons name="close-circle" size={20} color={COLORS.textMuted} onPress={() => setQuery('')} accessibilityLabel="Clear search" />
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
        {HEALTH.map((h) => {
          const n = data?.summary?.[h.key] ?? 0;
          const on = health === h.key;
          return (
            <Button
              key={h.key}
              label={`${h.label} ${n}`}
              size="sm"
              iconLeft={h.icon as never}
              variant={on ? 'primary' : 'outline'}
              color={n > 0 && !on ? COLORS.warn : COLORS.text}
              onPress={() => setHealth(on ? '' : h.key)}
              style={{ minHeight: 44 }}
              singleLine
            />
          );
        })}
      </ScrollView>

      {apps.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
          <DecisionChip label="All apps" selected={!app} onPress={() => setApp('')} />
          {apps.map((a) => <DecisionChip key={a} label={a.replace(/^Upande /, '')} selected={app === a} onPress={() => setApp(app === a ? '' : a)} />)}
        </ScrollView>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
        {(['', 'Active', 'Lost', 'Retired'] as const).map((st) => (
          <DecisionChip key={st || 'all'} label={st || 'Any state'} selected={state === st} onPress={() => setState(st)} />
        ))}
        <DecisionChip label="Group by model" selected={grouped} onPress={() => setGrouped((g) => !g)} />
      </ScrollView>

      <Text style={s.count} accessibilityLiveRegion="polite">
        {loading ? 'Loading fleet' : `${shown.length} of ${data?.total ?? 0} devices${(data?.total ?? 0) > 500 ? ' (first 500)' : ''}`}
      </Text>
    </View>
  );

  return (
    <Screen title="Devices" scroll={false} contentPadded={false} error={!data && error ? error : null} onRetry={reload}>
      {loading && !data ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <Skeleton height={44} radius={borderRadius.full} />
          <Skeleton height={44} radius={borderRadius.full} />
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={132} radius={borderRadius.md} />)}
        </View>
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={(i) => i.key}
            ListHeaderComponent={header}
            contentContainerStyle={{ paddingBottom: spacing.xxl }}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={8}
            windowSize={9}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.text} colors={[COLORS.text]} />}
            ListEmptyComponent={
              <View style={s.empty}>
                <Ionicons name="phone-portrait-outline" size={40} color={COLORS.textMuted} />
                <Text style={s.emptyT}>No devices match</Text>
                <Text style={s.emptyB}>Clear a filter or change the search.</Text>
              </View>
            }
            renderItem={({ item }) =>
              item.kind === 'head' ? (
                <Text style={s.group}>{item.title} · {item.count}</Text>
              ) : (
                <View style={s.cell}>
                  <SwipeRow
                    radius={borderRadius.md}
                    swipeRight={item.d.state !== 'Active' ? { label: 'Active', icon: 'checkmark-circle', color: COLORS.success, onTrigger: () => { setDeviceState(item.d, 'Active').catch((e) => toast.showError(String(e?.message ?? 'Could not update'))); } } : undefined}
                    swipeLeft={item.d.state === 'Active' ? { label: 'Lost', icon: 'alert-circle', color: COLORS.danger, onTrigger: () => setLost(item.d) } : undefined}
                  >
                    <DeviceCard d={item.d} onPress={open} />
                  </SwipeRow>
                </View>
              )
            }
          />
          <ConfirmSheet
            visible={!!lost}
            onClose={() => setLost(null)}
            title="Mark device as lost"
            consequence={lost ? `${lost.device} (${lost.owner_name || 'no owner'}) will be listed as Lost. Nothing is locked or wiped; it only flags the device for the team. You can mark it Active again.` : ''}
            confirmLabel="Mark lost"
            danger
            onConfirm={async () => { if (lost) await setDeviceState(lost, 'Lost'); }}
          />
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { padding: spacing.lg, gap: spacing.md },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md,
    backgroundColor: COLORS.surface, borderRadius: borderRadius.full, borderWidth: 1, borderColor: COLORS.border,
  },
  input: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text, minHeight: 44 },
  strip: { gap: spacing.sm, paddingRight: spacing.lg },
  count: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textMuted },
  cell: { marginHorizontal: spacing.lg, marginBottom: spacing.md },
  group: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.textSecondary, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.4 },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xxl },
  emptyT: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text },
  emptyB: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.textMuted },
});
