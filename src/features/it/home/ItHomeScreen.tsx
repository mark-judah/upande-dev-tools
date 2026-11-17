import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ItSourceChip } from '@/features/it/shared/ItSourceChip';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Skeleton } from '@/core/ui/Skeleton';
import { Row } from '@/core/ui/Row';
import { Pill } from '@/features/shared/Pill';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/core/theme';
import { itMobile } from '@/features/it/shared/it-api';
import { ItGate } from '@/features/it/shared/ItGate';
import { Bar, ChipRow, go, Note, Ring, SectionTitle, Spark, Tile, TONE } from './ui';
import { ago, useLive, useTick } from './useLive';

type Card_ = { key: string; count: number; route: string; severity: 'high' | 'medium' | 'low'; detail: Record<string, number | string> };
type Today = {
  cards: Card_[];
  people: number;
  devices: number;
  stats: {
    people: number;
    people_behind: number;
    people_away: number;
    adoption: number | null;
    tickets_open: number;
    tickets_waiting: number;
    problems_open: number;
    problems_crashes: number;
    people_hurt: number;
    devices_active_7d: number;
    platforms: Record<string, number>;
    android_versions: { label: string; major: number; count: number; old: boolean }[];
    events_by_day: { day: string; crash: number; error: number; api: number; log: number }[];
    tickets_by_status: { waiting: number; answered: number; resolved: number };
    health: { low_battery: number; low_storage: number; offline: number; outdated_os: number; outdated_app: number };
    app_mix: Record<string, { current: number; behind: number; away: number; unknown: number }>;
  };
};

const ROUTES: Record<string, string> = { updates: '/it/updates', support: '/it/support', crashlytics: '/it/crashes', devices: '/it/devices', away: '/it/updates?bucket=away' };
const CARD_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; title: (c: Card_) => string; body: (c: Card_) => string }> = {
  updates: { icon: 'cloud-download-outline', title: (c) => `${c.count} ${c.count === 1 ? 'person is' : 'people are'} behind on updates`, body: (c) => `${c.detail.forgot} just need to reopen, ${c.detail.cant_update} need a fresh install. Oldest release ${c.detail.oldest_days}d ago.` },
  support: { icon: 'chatbubbles-outline', title: (c) => `${c.count} ${c.count === 1 ? 'ticket is' : 'tickets are'} waiting for a reply`, body: (c) => `Longest wait ${c.detail.oldest_hours}h, from ${c.detail.oldest_user}.` },
  crashlytics: { icon: 'bug-outline', title: (c) => `${c.count} open ${c.count === 1 ? 'problem' : 'problems'} seen in the last 2 days`, body: (c) => `${c.detail.crashes} crashes, ${c.detail.people} people affected.` },
  devices: { icon: 'phone-portrait-outline', title: (c) => `${c.count} device ${c.count === 1 ? 'warning' : 'warnings'}`, body: (c) => `${c.detail.low_battery} low battery, ${c.detail.low_storage} low storage, ${c.detail.offline} offline, ${c.detail.outdated_os} old Android.` },
  away: { icon: 'moon-outline', title: (c) => `${c.count} people have not opened the app in a while`, body: () => 'Not seen for a long time. Check whether they still use it.' },
};
const SEV = {
  high: { bg: '#FEF2F2', fg: '#991B1B', label: 'Urgent' },
  medium: { bg: '#FFFBEB', fg: '#92400E', label: 'Soon' },
  low: { bg: '#F5F5F5', fg: '#525252', label: 'Watch' },
};

function HomeSkeleton() {
  return (
    <View style={{ gap: spacing.md }} accessibilityLabel="Loading IT overview">
      <View style={s.tiles}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={84} radius={borderRadius.lg} style={{ flexGrow: 1, flexBasis: '47%' }} />)}</View>
      <Skeleton height={40} radius={20} width={220} />
      <Skeleton height={176} radius={borderRadius.lg} />
      <Skeleton height={120} radius={borderRadius.md} />
      <Skeleton height={88} radius={borderRadius.md} />
    </View>
  );
}

function Home() {
  const [app, setApp] = useState('');
  const [names, setNames] = useState<string[]>([]);
  const { data, loading, error, updatedAt, reload } = useLive<Today>(async () => {
    const d = await itMobile<Today>('today', app ? { app } : {});
    if (!app) setNames(Object.keys(d.stats.app_mix).sort());
    return d;
  }, [app], 60000);
  useTick();

  const st = data?.stats;
  const unhealthy = st ? st.health.low_battery + st.health.low_storage + st.health.offline + st.health.outdated_os : 0;
  const hurt = st && st.people > 0 ? Math.max(0, Math.min(100, Math.round((1 - st.people_hurt / st.people) * 100))) : null;
  const ringTone = hurt == null ? TONE.ink : hurt >= 95 ? TONE.good : hurt >= 80 ? TONE.ink : TONE.alarm;
  const days = (st?.events_by_day ?? []).map((d) => ({ label: d.day.slice(5), total: d.crash + d.error + d.api + d.log, danger: d.crash + d.error }));
  const total14 = days.reduce((a, d) => a + d.total, 0);
  const crash14 = days.reduce((a, d) => a + d.danger, 0);

  return (
    <Screen title={app ? app : 'IT Workstation'} tab loading={loading && !data} error={!data ? error : null} onRetry={reload} onRefresh={reload}>
      {!data ? (
        <HomeSkeleton />
      ) : (
        <>
          <ItSourceChip />
          <View style={s.live}>
            <View style={s.dot} />
            <Text style={s.liveText}>Live · updated {ago(updatedAt)} · refreshes every 60s</Text>
          </View>

          <View style={s.tiles}>
            <Tile icon="bug-outline" label="Crashes open" value={st!.problems_open} sub={`${st!.problems_crashes} hard crashes`} tone={st!.problems_crashes > 0 ? 'alarm' : st!.problems_open > 0 ? 'ink' : 'good'} onPress={() => go('/it/crashes')} />
            <Tile icon="chatbubbles-outline" label="Tickets waiting" value={st!.tickets_waiting} sub={`${st!.tickets_open} open in all`} tone={st!.tickets_waiting > 0 ? 'alarm' : 'good'} onPress={() => go('/it/support')} />
            <Tile icon="phone-portrait-outline" label="Devices unhealthy" value={unhealthy} sub={`of ${data.devices} devices`} tone={unhealthy > 0 ? 'ink' : 'good'} onPress={() => go('/it/devices')} />
            <Tile icon="cloud-download-outline" label="Behind on updates" value={st!.people_behind} sub={`${st!.people_away} away`} tone={st!.people_behind > 0 ? 'alarm' : 'good'} onPress={() => go('/it/updates')} />
          </View>

          {names.length > 1 ? (
            <View style={{ marginTop: spacing.lg }}>
              <ChipRow value={app} onChange={setApp} items={[{ key: '', label: 'All apps' }, ...names.map((n) => ({ key: n, label: n.replace(/^Upande /, '') }))]} />
            </View>
          ) : null}

          <View style={[s.hero, { backgroundColor: ringTone.bg }]}>
            <Ring pct={hurt} size={116} on={ringTone.accent}>
              <Text style={s.ringNum} accessibilityLabel={hurt == null ? 'No data' : `${hurt} percent crash free`}>{hurt == null ? '—' : `${hurt}%`}</Text>
              <Text style={[s.ringSub, { color: ringTone.sub }]}>crash-free</Text>
            </Ring>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.heroTitle}>People not hit by a problem</Text>
              <Text style={[s.heroBody, { color: ringTone.sub }]}>{st!.people_hurt} hurt of {st!.people} people. Adoption {st!.adoption == null ? 'n/a' : `${st!.adoption}%`} on the latest version.</Text>
              <Text style={[s.heroFine, { color: ringTone.sub }]}>Computed as 1 minus people hurt by open problems, divided by people. Someone hit by several problems counts each time, so it can read low.</Text>
            </View>
          </View>

          <SectionTitle right={<Text style={s.meta}>{total14} events · {crash14} errors</Text>}>Last 14 days</SectionTitle>
          <Card>
            {total14 === 0 ? <Text style={s.empty}>No events reported in 14 days.</Text> : <Spark days={days} />}
            <View style={s.axis}><Text style={s.meta}>{days[0]?.label}</Text><Text style={s.meta}>{days[days.length - 1]?.label}</Text></View>
            <Note>Grey bars are all events a day, red is crashes and errors.</Note>
          </Card>

          <SectionTitle>Needs attention</SectionTitle>
          {data.cards.length === 0 ? (
            <View style={[s.hero, { backgroundColor: TONE.good.bg }]}>
              <Ionicons name="checkmark-circle" size={32} color={TONE.good.accent} />
              <View style={{ flex: 1 }}>
                <Text style={s.heroTitle}>All clear</Text>
                <Text style={[s.heroBody, { color: TONE.good.sub }]}>Nothing needs you right now.</Text>
              </View>
            </View>
          ) : (
            data.cards.map((c) => {
              const meta = CARD_META[c.key];
              const sev = SEV[c.severity] ?? SEV.low;
              if (!meta) return null;
              return (
                <Card key={c.key} style={{ padding: 0, overflow: 'hidden' }} onPress={() => go(ROUTES[c.key] ?? '/it')} accessibilityLabel={`${meta.title(c)}. ${meta.body(c)}. Open`}>
                  <View style={{ flexDirection: 'row' }}>
                    <View style={s.cardBody}>
                      <View style={[s.cardIcon, { backgroundColor: sev.bg }]}><Ionicons name={meta.icon} size={20} color={sev.fg} /></View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={s.cardTitle}>{meta.title(c)}</Text>
                        <Text style={s.cardText}>{meta.body(c)}</Text>
                      </View>
                      <Pill label={sev.label} tone={c.severity === 'high' ? 'danger' : c.severity === 'medium' ? 'warn' : 'neutral'} />
                    </View>
                  </View>
                </Card>
              );
            })
          )}

          <SectionTitle>Who is on the latest</SectionTitle>
          <Card>
            {Object.entries(st!.app_mix).length === 0 ? <Text style={s.empty}>No app has reported yet.</Text> : null}
            {Object.entries(st!.app_mix).map(([name, m]) => {
              const t = m.current + m.behind + m.away + m.unknown;
              return (
                <View key={name} style={{ gap: 6, marginBottom: spacing.md }} accessible accessibilityLabel={`${name}: ${m.current} current, ${m.behind} behind, ${m.away} away`}>
                  <View style={s.mixHead}><Text style={s.mixName} numberOfLines={1}>{name.replace(/^Upande /, '')}</Text><Text style={s.meta}>{t} people</Text></View>
                  <View style={s.stack}>
                    {[[m.current, TONE.good.accent], [m.behind, COLORS.danger], [m.away, '#A3A3A3'], [m.unknown, '#D4D4D4']].map(([n, c], i) => (n as number) > 0 ? <View key={i} style={{ flex: n as number, backgroundColor: c as string }} /> : null)}
                  </View>
                </View>
              );
            })}
            <View style={s.legend}>{[['Current', TONE.good.accent], ['Behind', COLORS.danger], ['Away', '#A3A3A3']].map(([l, c]) => <View key={l} style={s.lg}><View style={[s.lgDot, { backgroundColor: c }]} /><Text style={s.meta}>{l}</Text></View>)}</View>
          </Card>

          <SectionTitle>Android versions</SectionTitle>
          <Card>
            {st!.android_versions.length === 0 ? <Text style={s.empty}>No Android devices yet.</Text> : null}
            {st!.android_versions.map((v) => (
              <Bar key={v.major} label={v.label} value={v.count} max={Math.max(...st!.android_versions.map((x) => x.count))} color={v.old ? COLORS.danger : COLORS.text} note={v.old ? 'below the supported minimum' : undefined} />
            ))}
            <Note>Red means below the minimum Android version the site supports.</Note>
          </Card>

          <SectionTitle>Device health</SectionTitle>
          <Card>
            {(
              [['Low battery', st!.health.low_battery], ['Low storage', st!.health.low_storage], ['Offline', st!.health.offline], ['Old Android', st!.health.outdated_os], ['Old app', st!.health.outdated_app]] as [string, number][]
            ).map(([l, n]) => <Bar key={l} label={l} value={n} max={Math.max(1, data.devices)} color={n > 0 ? COLORS.warn : COLORS.border} />)}
            <Note>{`Out of ${data.devices} devices; ${st!.devices_active_7d} opened in the last 7 days.`}</Note>
          </Card>

          <Card style={{ padding: 0 }}>
            <Row title="Apps and releases" subtitle="Adoption, who installed what" onPress={() => go('/it/apps')} left={<Ionicons name="apps-outline" size={22} color={COLORS.text} />} divider />
            <Row title="Update chase" subtitle="Remind people to update" onPress={() => go('/it/updates')} left={<Ionicons name="notifications-outline" size={22} color={COLORS.text} />} divider />
            <Row title="App store" subtitle="Install the team's apps" onPress={() => go('/it/store')} left={<Ionicons name="storefront-outline" size={22} color={COLORS.text} />} />
          </Card>
        </>
      )}
    </Screen>
  );
}

export default function ItHomeScreen() {
  return (
    <ItGate title="IT Workstation" tab>
      <Home />
    </ItGate>
  );
}

const s = StyleSheet.create({
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.md },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success },
  liveText: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, borderRadius: borderRadius.lg, padding: spacing.lg, marginTop: spacing.sm },
  ringNum: { fontFamily: fontFamily.bold, fontSize: 26, color: '#fff' },
  ringSub: { fontFamily: fontFamily.medium, fontSize: fontSize.xs },
  heroTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: '#fff' },
  heroBody: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, lineHeight: 19 },
  heroFine: { fontFamily: fontFamily.regular, fontSize: 11, lineHeight: 15, opacity: 0.8, marginTop: 2 },
  meta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  cardBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  cardIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  cardText: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, lineHeight: 16 },
  mixHead: { flexDirection: 'row', justifyContent: 'space-between' },
  mixName: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text, flexShrink: 1 },
  stack: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: COLORS.bgMuted, gap: 1 },
  legend: { flexDirection: 'row', gap: spacing.lg },
  lg: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lgDot: { width: 8, height: 8, borderRadius: 4 },
});
