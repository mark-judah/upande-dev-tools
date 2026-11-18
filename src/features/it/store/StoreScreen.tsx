import { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/core/ui/Screen';
import { Button } from '@/core/ui/Button';
import { Skeleton } from '@/core/ui/Skeleton';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { BottomSheet } from '@/core/ui/Dialog';
import { useToast } from '@/core/ui/Toast';
import { getItEndpoint } from '@/core/it-source/it-client';
import { followDevHost } from '@/core/api/dev-host';
import { APP_NAME, APP_VERSION } from '@/core/version';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/core/theme';
import { mobileApi, post } from '@/features/it/shared/it-api';
import { ItGate } from '@/features/it/shared/ItGate';
import { ConfirmSheet } from '@/features/it/shared/ConfirmSheet';
import { fmtDate } from '@/features/it/home/ui';
import { useCountdown, useLive } from '@/features/it/home/useLive';
import { actionFor, applyChip, chipsFor, initials, matchesQuery, metaLine, sanitizeApps, shortName, type AppAction, type StoreApp, type StoreList } from './store-model';

const SELF = { name: APP_NAME, version: APP_VERSION };
const ACTION_LABEL: Record<AppAction, string> = { install: 'Install', update: 'Update', installed: 'Installed' };

/** The app's icon. The server sends no icon yet, so a calm initial-letter tile on a neutral token stands in. */
function AppIcon({ app, size }: { app: string; size: number }) {
  return (
    <View style={[s.icon, { width: size, height: size, borderRadius: Math.round(size * 0.24) }]} accessibilityElementsHidden importantForAccessibility="no">
      <Text style={[s.iconText, { fontSize: Math.round(size * 0.38) }]}>{initials(app)}</Text>
    </View>
  );
}

function ActionPill({ action, busy, onPress, label }: { action: AppAction; busy?: boolean; onPress: () => void; label?: string }) {
  const done = action === 'installed';
  return (
    <Pressable
      onPress={onPress}
      disabled={done || busy}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label ?? ACTION_LABEL[action]}
      style={({ pressed }) => [s.pill, done ? s.pillDone : s.pillPrimary, pressed && { opacity: 0.8 }]}
    >
      {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[s.pillText, done && s.pillTextDone]}>{ACTION_LABEL[action]}</Text>}
    </Pressable>
  );
}

const AppRow = memo(function AppRow({ a, onOpen, onAction }: { a: StoreApp; onOpen: (a: StoreApp) => void; onAction: (a: StoreApp) => void }) {
  const action = actionFor(a, SELF);
  return (
    <Pressable
      onPress={() => onOpen(a)}
      accessibilityRole="button"
      accessibilityLabel={`${a.app}, ${metaLine(a) || 'no version'}. Details`}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: COLORS.bgMuted }]}
    >
      <AppIcon app={a.app} size={56} />
      <View style={s.rowText}>
        <Text style={s.name} numberOfLines={1}>{shortName(a.app)}</Text>
        <Text style={s.sub} numberOfLines={1}>{[a.platform[0]?.toUpperCase() + a.platform.slice(1), a.released ? fmtDate(a.released) : ''].filter(Boolean).join(' · ')}</Text>
        {metaLine(a) ? <Text style={s.meta} numberOfLines={1}>{metaLine(a)}</Text> : null}
      </View>
      <ActionPill action={action} onPress={() => onAction(a)} label={`${ACTION_LABEL[action]} ${a.app}`} />
    </Pressable>
  );
});

function RowSkeleton() {
  return (
    <View style={s.row}>
      <Skeleton width={56} height={56} radius={borderRadius.lg} />
      <View style={[s.rowText, { gap: 6 }]}>
        <Skeleton height={14} width="60%" />
        <Skeleton height={12} width="40%" />
      </View>
      <Skeleton width={76} height={32} radius={borderRadius.full} />
    </View>
  );
}

function Store() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useLive(async () => ({ apps: sanitizeApps(await mobileApi<unknown>('store.apps')) }), []);
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState('');
  const [detail, setDetail] = useState<StoreApp | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [until, setUntil] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const left = useCountdown(until);

  const apps = useMemo(() => data?.apps ?? [], [data]);
  const chips = useMemo(() => chipsFor(apps, SELF), [apps]);
  const shown = useMemo(() => applyChip(apps, chip, SELF).filter((a) => matchesQuery(a, query)), [apps, chip, query]);
  const updates = useMemo(() => (chip || query ? [] : apps.filter((a) => actionFor(a, SELF) === 'update')), [apps, chip, query]);

  // The APK is handed to the browser / installer, never read into JS memory. The download goes through the active
  // instance, which serves it from its own copy of the GitHub release.
  const download = useCallback(
    async (a: StoreApp) => {
      try {
        const base = (await getItEndpoint())?.baseUrl;
        if (!base) throw new Error('no instance');
        await Linking.openURL(`${followDevHost(base).replace(/\/$/, '')}/api/method/upande_mobile.api.store.download?app=${encodeURIComponent(a.app)}`);
      } catch {
        toast.showError(`Could not open the download for ${shortName(a.app)}. Try again.`);
      }
    },
    [toast],
  );
  const open = useCallback((a: StoreApp) => setDetail(a), []);

  const check = async () => {
    const r = await post.mobileApi<{ refreshed: boolean; retry_in: number } & StoreList>('store.check_updates');
    setUntil(Date.now() + (Number(r.retry_in) || 120) * 1000);
    if (r.apps) setData({ apps: sanitizeApps(r) });
    if (r.refreshed) toast.showSuccess('Checked for new releases. The list is up to date.');
    else toast.showInfo('Someone checked a moment ago. This is the latest list.');
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  };

  const renderItem = useCallback(({ item }: { item: StoreApp }) => <AppRow a={item} onOpen={open} onAction={download} />, [open, download]);

  const header = (
    <View>
      <View style={s.search}>
        <Ionicons name="search" size={18} color={COLORS.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search apps"
          placeholderTextColor={COLORS.textMuted}
          style={s.input}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search apps"
        />
        {query ? <Ionicons name="close-circle" size={18} color={COLORS.textMuted} onPress={() => setQuery('')} accessibilityLabel="Clear search" /> : null}
      </View>
      {chips.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} style={{ flexGrow: 0 }}>
          {chips.map((c) => <DecisionChip key={c.key || 'all'} label={c.label} selected={chip === c.key} onPress={() => setChip(c.key)} />)}
        </ScrollView>
      ) : null}
      {updates.length ? (
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.sectionTitle}>Updates available</Text>
            {updates.length > 1 ? <Text style={s.link} onPress={() => updates.forEach((a) => void download(a))} accessibilityRole="button">Update all</Text> : null}
          </View>
          {updates.map((a) => <AppRow key={`u:${a.app}`} a={a} onOpen={open} onAction={download} />)}
        </View>
      ) : null}
      {data && apps.length ? <Text style={[s.sectionTitle, s.allTitle]}>{query || chip ? `${shown.length} ${shown.length === 1 ? 'app' : 'apps'}` : 'All apps'}</Text> : null}
    </View>
  );

  const headerRight = (
    <Pressable
      onPress={() => setConfirm(true)}
      disabled={left > 0}
      hitSlop={8}
      style={s.hbtn}
      accessibilityRole="button"
      accessibilityLabel={left > 0 ? `Check for new releases again in ${left} seconds` : 'Check for new releases'}
    >
      {left > 0 ? <Text style={s.countdown}>{left}s</Text> : <Ionicons name="refresh" size={22} color={COLORS.text} />}
    </Pressable>
  );

  return (
    <Screen title="App store" scroll={false} contentPadded={false} headerRight={headerRight}>
      {!data && error ? (
        <View style={s.center}>
          <Ionicons name="cloud-offline-outline" size={40} color={COLORS.textMuted} />
          <Text style={s.emptyTitle}>Could not load the store</Text>
          <Text style={s.emptyBody}>{error}</Text>
          <Button label="Try again" onPress={reload} style={{ alignSelf: 'stretch' }} />
        </View>
      ) : (
        <FlatList
          data={data ? shown : []}
          keyExtractor={keyOf}
          renderItem={renderItem}
          ListHeaderComponent={header}
          ItemSeparatorComponent={Divider}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={10}
          windowSize={9}
          removeClippedSubviews={Platform.OS === 'android'}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.text} colors={[COLORS.text]} />}
          ListEmptyComponent={
            loading && !data ? (
              <View accessibilityLabel="Loading apps">{[0, 1, 2, 3, 4].map((i) => <RowSkeleton key={i} />)}</View>
            ) : (
              <View style={s.center}>
                <Ionicons name="storefront-outline" size={40} color={COLORS.textMuted} />
                <Text style={s.emptyTitle}>{apps.length ? 'No apps match' : 'No apps to install yet'}</Text>
                <Text style={s.emptyBody}>{apps.length ? 'Try another search or filter.' : 'An app shows up here once it has a published APK release.'}</Text>
              </View>
            )
          }
          ListFooterComponent={
            data && apps.length ? (
              <Text style={s.foot}>
                {Platform.OS === 'web' ? 'Apps download in your browser.' : 'Apps download in your browser. Sign in to the same server if asked, then allow the browser to install apps.'}
              </Text>
            ) : undefined
          }
        />
      )}

      <DetailSheet app={detail} onClose={() => setDetail(null)} onAction={download} />
      <ConfirmSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Check for new releases"
        consequence="This re-reads every enabled app's newest release now, for everyone. Nobody is notified. It can run once every 2 minutes."
        confirmLabel="Check now"
        onConfirm={check}
      />
    </Screen>
  );
}

const keyOf = (a: StoreApp) => a.app;
function Divider() {
  return <View style={s.divider} />;
}

function DetailSheet({ app, onClose, onAction }: { app: StoreApp | null; onClose: () => void; onAction: (a: StoreApp) => void }) {
  if (!app) return null;
  const action = actionFor(app, SELF);
  const facts: [string, string][] = [
    ['Version', app.version ? `v${app.version}` : 'Unknown'],
    ['Size', app.size_mb != null ? `${app.size_mb} MB` : 'Unknown'],
    ['Updated', app.released ? fmtDate(app.released) : 'Unknown'],
    ['Platform', app.platform[0]?.toUpperCase() + app.platform.slice(1)],
    ...(action !== 'install' ? ([['On this phone', `v${APP_VERSION}`]] as [string, string][]) : []),
  ];
  return (
    <BottomSheet visible onClose={onClose} title={shortName(app.app)}>
      <View style={s.hero}>
        <AppIcon app={app.app} size={72} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.heroName}>{app.app}</Text>
          <Text style={s.sub}>Upande · {app.platform[0]?.toUpperCase() + app.platform.slice(1)}</Text>
        </View>
      </View>
      <Button
        label={action === 'installed' ? 'Installed' : `${ACTION_LABEL[action]}${app.size_mb != null ? ` · ${app.size_mb} MB` : ''}`}
        iconLeft={action === 'installed' ? 'checkmark' : 'download-outline'}
        disabled={action === 'installed'}
        onPress={() => onAction(app)}
      />
      <View style={s.facts}>
        {facts.map(([k, v]) => (
          <View key={k} style={s.fact}>
            <Text style={s.factLabel}>{k}</Text>
            <Text style={s.factValue}>{v}</Text>
          </View>
        ))}
      </View>
      <Text style={s.h}>Requirements</Text>
      <Text style={s.body}>
        {app.platform === 'android' ? 'Android phone or handheld. ' : ''}The first install asks you to allow your browser to install apps. The download comes from your
        organisation&apos;s server, so sign in to it if asked.
      </Text>
      {app.file ? <Text style={[s.meta, { marginTop: spacing.sm }]}>{app.file}</Text> : null}
    </BottomSheet>
  );
}

export default function StoreScreen() {
  return (
    <ItGate title="App store">
      <Store />
    </ItGate>
  );
}

const s = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  hbtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -spacing.sm },
  countdown: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textMuted },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.lg, borderRadius: borderRadius.full, backgroundColor: COLORS.surface },
  input: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text, minHeight: 44 },
  chips: { gap: spacing.sm, paddingTop: spacing.md, paddingRight: spacing.lg },
  section: { marginTop: spacing.lg },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text, marginBottom: spacing.xs },
  allTitle: { marginTop: spacing.lg },
  link: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text, paddingVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderRadius: borderRadius.md },
  rowText: { flex: 1, gap: 2 },
  icon: { backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontFamily: fontFamily.semiBold, color: COLORS.textSecondary },
  name: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  meta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  pill: { minWidth: 84, height: 34, paddingHorizontal: spacing.lg, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  pillPrimary: { backgroundColor: COLORS.primary },
  pillDone: { backgroundColor: COLORS.surface },
  pillText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textOnPrimary },
  pillTextDone: { color: COLORS.textMuted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginLeft: 56 + spacing.md },
  center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm, flexGrow: 1 },
  emptyTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text, textAlign: 'center' },
  emptyBody: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.textMuted, textAlign: 'center' },
  foot: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, textAlign: 'center', marginTop: spacing.xl },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.lg },
  heroName: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xl, color: COLORS.text },
  facts: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.lg, rowGap: spacing.md },
  fact: { width: '50%', gap: 2 },
  factLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  factValue: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
  h: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text, marginTop: spacing.lg, marginBottom: spacing.xs },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary, lineHeight: 20 },
});
