import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Skeleton } from '@/core/ui/Skeleton';
import { useAuthStore } from '@/core/auth/store';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { useAchievements } from './achievements-store';
import { BadgeGrid, MiniLeaderboard, ProgressCard } from './achievements-ui';

const TOP_N = 5;

export function AchievementsScreen() {
  const data = useAchievements((s) => s.data);
  const loading = useAchievements((s) => s.loading);
  const error = useAchievements((s) => s.error);
  const load = useAchievements((s) => s.load);
  const hydrate = useAchievements((s) => s.hydrate);
  const email = useAuthStore((s) => s.email);

  useEffect(() => {
    hydrate().then(load);
  }, [hydrate, load]);

  const earned = data?.badges.filter((b) => b.earned).length ?? 0;

  return (
    <Screen title="Achievements" onRefresh={async () => { await load(); }} error={!data ? error : null} onRetry={load}>
      {!data ? (
        <>
          <Skeleton height={150} style={{ borderRadius: borderRadius.xl, marginBottom: spacing.md }} />
          <Skeleton height={64} style={{ borderRadius: borderRadius.lg, marginBottom: spacing.md }} />
          <Skeleton height={200} style={{ borderRadius: borderRadius.lg }} />
        </>
      ) : (
        <>
          <ProgressCard data={data} />

          <View style={s.tiles}>
            <Tile label="TODAY" value={data.points_today} />
            <Tile label="TOTAL" value={data.points_total} />
            <Tile label="BEST STREAK" value={data.best_streak} />
          </View>

          <Card title={`Badges · ${earned}/${data.badges.length}`}>
            <BadgeGrid badges={data.badges} />
          </Card>

          <Card title="Top contributors this week">
            <MiniLeaderboard board={data.leaderboard} email={email} limit={TOP_N} />
          </Card>
        </>
      )}
      {loading && data ? <Text style={s.refreshing}>Updating…</Text> : null}
    </Screen>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <View style={s.tile}>
      <Text style={s.chip} numberOfLines={1}>{label}</Text>
      <Text style={s.tileNum} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.6}>
        {value.toLocaleString()}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  chip: { fontFamily: fontFamily.medium, fontSize: 10, letterSpacing: 0.6, color: '#86EFAC', textTransform: 'uppercase' },
  tiles: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  tile: { flex: 1, minHeight: 64, backgroundColor: '#171717', borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, justifyContent: 'space-between' },
  tileNum: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, lineHeight: 28, color: '#fff' },
  refreshing: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, textAlign: 'center' },
});
