import { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { ProgressBar } from '@/core/ui/ProgressBar';
import { Skeleton } from '@/core/ui/Skeleton';
import { useToast } from '@/core/ui/Toast';
import { useAuthStore } from '@/core/auth/store';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { NEXT_STAGE } from '@/features/shared/types';
import { useAchievements } from '@/features/gamification/achievements-store';
import { STREAK_MILESTONES } from '@/features/gamification/achievements-api';
import { isOverdue, isToday, stageOf, useMyDay } from './my-day-store';
import { format } from 'date-fns';

export function MyDayScreen() {
  const data = useMyDay((s) => s.data);
  const loading = useMyDay((s) => s.loading);
  const error = useMyDay((s) => s.error);
  const load = useMyDay((s) => s.load);
  const moveTask = useMyDay((s) => s.moveTask);
  const fullName = useAuthStore((s) => s.fullName);
  const toast = useToast();

  useEffect(() => {
    load();
  }, [load]);

  const today = format(new Date(), 'yyyy-MM-dd');
  const tasks = data?.tasks ?? [];
  const plate = tasks.filter((t) => isToday(t, today));
  const upNext = tasks.filter((t) => !isToday(t, today)).slice(0, 8);
  const overdue = tasks.filter((t) => isOverdue(t, today));
  const inReview = tasks.filter((t) => stageOf(t) === 'In Review').length;
  const doneWeek = data?.progress.completed_this_week ?? 0;
  const donePrev = data?.progress.completed_prev_week ?? 0;
  const firstName = (fullName || '').split(' ')[0] || 'there';

  const advance = useCallback(
    async (name: string, current: ReturnType<typeof stageOf>) => {
      const next = NEXT_STAGE[current];
      if (!next) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const ok = await moveTask(name, next);
      if (!ok) toast.showError('Could not update the task');
      else if (next === 'Done') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        const before = useAchievements.getState().data;
        const after = await useAchievements.getState().load();
        const gained = after && before ? after.points_total - before.points_total : 0;
        toast.showSuccess(gained > 0 ? `Task closed +${gained} pts` : 'Task closed');
        if (after && after.streak > (before?.streak ?? 0) && STREAK_MILESTONES.includes(after.streak)) {
          toast.showInfo(`${after.streak} day streak. Keep it going!`);
        }
      }
    },
    [moveTask, toast],
  );

  const renderTask = (t: (typeof tasks)[number]) => {
    const stage = stageOf(t);
    const next = NEXT_STAGE[stage];
    const late = isOverdue(t, today);
    return (
      <View key={t.name} style={s.row}>
        <Pressable onPress={() => advance(t.name, stage)} disabled={!next} hitSlop={8} accessibilityLabel={next ? `Move to ${next}` : 'Done'}>
          <Ionicons name={stage === 'Todo' ? 'ellipse-outline' : 'play-circle-outline'} size={26} color={COLORS.text} />
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={() => router.push(`/task/${t.name}` as never)}>
          <Text style={s.rowText} numberOfLines={2}>{t.subject}</Text>
          <Text style={[s.meta, late && { color: COLORS.danger }]}>
            {stage}
            {t.priority ? ` · ${t.priority}` : ''}
            {t.exp_end_date ? ` · ${late ? 'was due' : 'due'} ${t.exp_end_date}` : ''}
          </Text>
        </Pressable>
      </View>
    );
  };

  return (
    <Screen title="My Day" onRefresh={load} error={!data ? error : null} onRetry={load}>
      <Text style={s.hello}>Welcome back, {firstName}</Text>
      <Text style={s.caption}>{format(new Date(today), 'EEEE, d MMMM')}</Text>

      {loading && !data ? (
        <Skeleton height={150} style={{ borderRadius: 24, marginBottom: spacing.md }} />
      ) : (
        <Pressable style={s.hero} onPress={() => router.push('/backlog')}>
          <Ionicons name="checkmark-done" size={120} color="rgba(255,255,255,0.06)" style={s.heroGhost} />
          <Text style={s.chip}>ON YOUR PLATE TODAY</Text>
          <Text style={s.heroNum} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.6}>
            {plate.length}
          </Text>
          <Text style={s.heroSub}>
            {plate.length === 0 ? 'Nothing due. Capture something or pick from the backlog.' : `${doneWeek} closed this week${donePrev ? ` · ${donePrev} last week` : ''}`}
          </Text>
          <ProgressBar scale={1} value={donePrev ? doneWeek / donePrev : doneWeek > 0 ? 1 : 0} />
        </Pressable>
      )}

      <View style={s.tiles}>
        <Tile label="OVERDUE" value={overdue.length} hot={overdue.length > 0} onPress={() => router.push('/backlog')} />
        <Tile label="IN REVIEW" value={inReview} onPress={() => router.push('/backlog')} />
      </View>

      {data && data.meetings.length > 0 ? (
        <Card title="Meetings">
          {data.meetings.map((m) => (
            <View key={m.name} style={s.row}>
              <Text style={s.time}>{format(new Date(m.starts_on.replace(' ', 'T')), 'HH:mm')}</Text>
              <Text style={s.rowText} numberOfLines={1}>{m.subject}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      <Card title="Today's tasks">
        {plate.length === 0 ? <Text style={s.empty}>Nothing due. Tap + to capture something.</Text> : plate.map(renderTask)}
      </Card>

      {upNext.length > 0 ? <Card title="Up next">{upNext.map(renderTask)}</Card> : null}
    </Screen>
  );
}

function Tile({ label, value, hot, onPress }: { label: string; value: number; hot?: boolean; onPress: () => void }) {
  return (
    <Pressable style={[s.tile, hot && s.tileHot]} onPress={onPress}>
      <Text style={[s.chip, hot && { color: '#FECACA' }]}>{label}</Text>
      <Text style={[s.tileNum, hot && { color: '#FCA5A5' }]}>{value.toLocaleString()}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  hello: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text },
  caption: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, marginBottom: spacing.md },
  hero: { backgroundColor: '#052E16', borderRadius: 24, padding: spacing.lg, marginBottom: spacing.md, overflow: 'hidden', gap: spacing.sm },
  heroGhost: { position: 'absolute', right: -10, top: -10 },
  chip: { fontFamily: fontFamily.medium, fontSize: 10, letterSpacing: 1.2, color: '#86EFAC' },
  heroNum: { fontFamily: fontFamily.bold, fontSize: 52, color: '#fff' },
  heroOf: { fontSize: 28, color: '#86EFAC' },
  heroSub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: '#BBF7D0' },
  tiles: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  tile: { flex: 1, minHeight: 110, backgroundColor: COLORS.text, borderRadius: 20, padding: spacing.md, justifyContent: 'space-between' },
  tileHot: { backgroundColor: '#3B0A0A' },
  tileNum: { fontFamily: fontFamily.bold, fontSize: 34, color: '#fff' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  rowText: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text, flex: 1 },
  struck: { textDecorationLine: 'line-through', color: COLORS.textMuted },
  meta: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  time: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: COLORS.text, width: 48 },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
});
