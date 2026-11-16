import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Skeleton } from '@/core/ui/Skeleton';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/core/theme';
import { itMobile } from '@/features/it/shared/it-api';
import { ItGate } from '@/features/it/shared/ItGate';
import { ChipRow, daysLabel, go, Ring } from '@/features/it/home/ui';
import { ago, useLive, useTick } from '@/features/it/home/useLive';
import { AppSheet } from './AppSheet';
import type { AppRow } from './types';

type Filter = 'all' | 'behind' | 'issues' | 'tickets';

function Stat({ n, label, bad }: { n: number; label: string; bad?: boolean }) {
  return (
    <View style={s.stat} accessible accessibilityLabel={`${n} ${label}`}>
      <Text style={[s.statN, bad && n > 0 ? { color: COLORS.danger } : null]}>{n}</Text>
      <Text style={s.statL} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function Apps() {
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<AppRow | null>(null);
  const { data, loading, error, updatedAt, reload, refresh } = useLive(() => itMobile<{ rows: AppRow[] }>('apps'), [], 60000);
  useTick();
  const rows = data?.rows ?? [];
  const count = {
    all: rows.length,
    behind: rows.filter((r) => r.behind > 0).length,
    issues: rows.filter((r) => r.problems > 0).length,
    tickets: rows.filter((r) => r.open_tickets > 0).length,
  };
  const shown = rows.filter((r) => filter === 'all' || (filter === 'behind' ? r.behind > 0 : filter === 'issues' ? r.problems > 0 : r.open_tickets > 0));

  return (
    <Screen title="Apps and releases" tab loading={loading && !data} error={!data ? error : null} onRetry={reload} onRefresh={reload}>
      {!data ? (
        <View style={{ gap: spacing.md }} accessibilityLabel="Loading apps">
          <Skeleton height={44} radius={22} width={240} />
          {[0, 1, 2].map((i) => <Skeleton key={i} height={168} radius={borderRadius.md} />)}
        </View>
      ) : (
        <>
          <ChipRow
            value={filter}
            onChange={(k) => setFilter(k as Filter)}
            items={[
              { key: 'all', label: `All ${count.all}` },
              { key: 'behind', label: `Behind ${count.behind}` },
              { key: 'issues', label: `Issues ${count.issues}` },
              { key: 'tickets', label: `Tickets ${count.tickets}` },
            ]}
          />
          <Text style={s.updated}>Updated {ago(updatedAt)}</Text>
          {shown.length === 0 ? (
            <Card>
              <Text style={s.emptyT}>{rows.length === 0 ? 'No apps are being tracked yet.' : 'No app matches this filter.'}</Text>
              <Text style={s.emptyB}>{rows.length === 0 ? 'Enable an app in Mobile App settings and it will show up here.' : 'Good news, or try All.'}</Text>
            </Card>
          ) : null}
          {shown.map((r) => (
            <Card key={r.app} onPress={() => setOpen(r)} accessibilityLabel={`${r.app} ${r.version || 'no version'}, ${r.adoption ?? 'no'} percent adoption. Open details`}>
              <View style={s.head}>
                <Ring pct={r.adoption} size={72} ticks={32} on={COLORS.success} off={COLORS.border}>
                  <Text style={s.ringNum}>{r.adoption == null ? '—' : `${r.adoption}%`}</Text>
                </Ring>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.name} numberOfLines={1}>{r.app}</Text>
                  <Text style={s.ver}>{r.version ? `v${r.version}` : 'No version yet'}</Text>
                  <Text style={s.when}>{daysLabel(r.released_days_ago)} · {r.people} people</Text>
                </View>
              </View>
              <View style={s.stats}>
                <Stat n={r.behind} label="behind" bad />
                <Stat n={r.away} label="away" />
                <Stat n={r.problems} label="issues" bad />
                <Stat n={r.people_hurt} label="hurt" bad />
                <Stat n={r.open_tickets} label="tickets" bad />
              </View>
            </Card>
          ))}
          <Text style={s.link} onPress={() => go('/it/store')} accessibilityRole="link">Open the app store</Text>
        </>
      )}
      <AppSheet row={open} onClose={() => setOpen(null)} onChanged={refresh} />
    </Screen>
  );
}

export default function AppsScreen() {
  return (
    <ItGate title="Apps and releases" tab>
      <Apps />
    </ItGate>
  );
}

const s = StyleSheet.create({
  updated: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, marginBottom: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  ringNum: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: COLORS.text },
  name: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text },
  ver: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.textSecondary },
  when: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  stats: { flexDirection: 'row', marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  stat: { flex: 1, alignItems: 'center' },
  statN: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: COLORS.text },
  statL: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  emptyT: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  emptyB: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, marginTop: 4 },
  link: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text, textDecorationLine: 'underline', textAlign: 'center', paddingVertical: spacing.md, minHeight: 44 },
});
