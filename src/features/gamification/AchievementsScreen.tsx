import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Skeleton } from '@/core/ui/Skeleton';
import { useAuthStore } from '@/core/auth/store';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { useAchievements } from './achievements-store';

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

  const board = (data?.leaderboard ?? []).filter((c) => c.points > 0).slice(0, TOP_N);
  const earned = data?.badges.filter((b) => b.earned).length ?? 0;

  return (
    <Screen title="Achievements" onRefresh={async () => { await load(); }} error={!data ? error : null} onRetry={load}>
      {!data ? (
        <>
          <Skeleton height={150} style={{ borderRadius: 24, marginBottom: spacing.md }} />
          <Skeleton height={110} style={{ borderRadius: 20, marginBottom: spacing.md }} />
          <Skeleton height={200} style={{ borderRadius: 16 }} />
        </>
      ) : (
        <>
          <View style={s.hero}>
            <Ionicons name="flame" size={120} color="rgba(255,255,255,0.06)" style={s.ghost} />
            <Text style={s.chip}>POINTS THIS WEEK</Text>
            <Text style={s.heroNum} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.6}>
              {data.points_week.toLocaleString()}
            </Text>
            <View style={s.streakRow}>
              <Ionicons name="flame" size={18} color={data.streak > 0 ? '#FB923C' : '#4ADE80'} />
              <Text style={s.heroSub}>
                {data.streak > 0 ? `${data.streak} day streak` : 'Close a task to start a streak'}
                {data.closed_week > 0 ? ` · ${data.closed_week} closed this week` : ''}
              </Text>
            </View>
          </View>

          <View style={s.tiles}>
            <Tile label="TODAY" value={data.points_today} />
            <Tile label="TOTAL" value={data.points_total} />
            <Tile label="BEST STREAK" value={data.best_streak} />
          </View>

          <Card title={`Badges · ${earned}/${data.badges.length}`}>
            {data.badges.length === 0 ? (
              <Text style={s.empty}>No badges yet.</Text>
            ) : (
              <View style={s.grid}>
                {data.badges.map((b) => (
                  <View key={b.key} style={[s.badge, !b.earned && s.locked]}>
                    <Ionicons
                      name={b.earned ? 'ribbon' : 'lock-closed-outline'}
                      size={26}
                      color={b.earned ? COLORS.success : COLORS.textMuted}
                    />
                    <Text style={s.badgeLabel} numberOfLines={2}>{b.label}</Text>
                    <Text style={s.badgeHint} numberOfLines={3}>{b.description}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>

          <Card title="Top contributors this week">
            {board.length === 0 ? (
              <Text style={s.empty}>Nobody has closed a task this week yet. Be the first.</Text>
            ) : (
              board.map((c, i) => {
                const me = !!email && c.user === email;
                return (
                  <View key={c.user} style={[s.lbRow, me && s.lbMe]}>
                    <Text style={s.rank}>{i + 1}</Text>
                    <Text style={[s.lbName, me && s.lbNameMe]} numberOfLines={1}>
                      {c.full_name || c.user}{me ? ' (you)' : ''}
                    </Text>
                    <Text style={s.lbPts}>{c.points} pts</Text>
                  </View>
                );
              })
            )}
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
      <Text style={s.chip}>{label}</Text>
      <Text style={s.tileNum} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.6}>
        {value.toLocaleString()}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { backgroundColor: '#052E16', borderRadius: 24, padding: spacing.lg, marginBottom: spacing.md, overflow: 'hidden', gap: spacing.sm },
  ghost: { position: 'absolute', right: -10, top: -10 },
  chip: { fontFamily: fontFamily.medium, fontSize: 10, letterSpacing: 1.2, color: '#86EFAC', textTransform: 'uppercase' },
  heroNum: { fontFamily: fontFamily.bold, fontSize: 52, color: '#fff' },
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  heroSub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: '#BBF7D0', flexShrink: 1 },
  tiles: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  tile: { flex: 1, minHeight: 100, backgroundColor: '#171717', borderRadius: 20, padding: spacing.md, justifyContent: 'space-between' },
  tileNum: { fontFamily: fontFamily.bold, fontSize: 30, color: '#fff' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: { width: '48%', flexGrow: 1, backgroundColor: COLORS.surfaceAlt, borderRadius: 16, padding: spacing.md, gap: spacing.xs },
  locked: { opacity: 0.5 },
  badgeLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  badgeHint: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  lbRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: 12 },
  lbMe: { backgroundColor: '#F0FDF4' },
  rank: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: COLORS.textMuted, width: 20 },
  lbName: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
  lbNameMe: { fontFamily: fontFamily.semiBold },
  lbPts: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: COLORS.text },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  refreshing: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, textAlign: 'center' },
});
