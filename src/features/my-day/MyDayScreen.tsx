import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { differenceInMinutes, format } from 'date-fns';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Row } from '@/core/ui/Row';
import { Button } from '@/core/ui/Button';
import { ProgressBar } from '@/core/ui/ProgressBar';
import { Skeleton } from '@/core/ui/Skeleton';
import { useAuthStore } from '@/core/auth/store';
import { relativeDue, timeOf, todayKey, type DueTone } from '@/core/date';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { Pill } from '@/features/shared/Pill';
import { NEXT_STAGE, type TaskRow } from '@/features/shared/types';
import { useAchievements } from '@/features/gamification/achievements-store';
import { BadgeScroller, Collapsible, MiniLeaderboard, ProgressCard, UnlockCard, useBadgeUnlocks } from '@/features/gamification/achievements-ui';
import { useCaptureUi } from '@/features/capture/capture-ui';
import { useTaskActions } from '@/features/tasks/useTaskActions';
import { isOverdue, stageOf, useMyDay } from './my-day-store';

const PRIORITY_RANK: Record<string, number> = { Urgent: 4, High: 3, Medium: 2, Low: 1 };
const rank = (t: TaskRow) => PRIORITY_RANK[t.priority] ?? 0;
const TONE: Record<DueTone, 'danger' | 'warn' | 'info' | 'neutral'> = { late: 'danger', today: 'warn', soon: 'info', later: 'neutral', none: 'neutral' };
const SHOW = 4; // rows per section before "See all"

type Bucket = { key: string; title: string; tasks: TaskRow[]; filter: string };

export function MyDayScreen() {
  const data = useMyDay((s) => s.data);
  const loading = useMyDay((s) => s.loading);
  const error = useMyDay((s) => s.error);
  const load = useMyDay((s) => s.load);
  const stats = useAchievements((s) => s.data);
  const loadStats = useAchievements((s) => s.load);
  const hydrateStats = useAchievements((s) => s.hydrate);
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);
  const { unlocked, dismiss: dismissUnlock } = useBadgeUnlocks(stats);
  const setCaptureOpen = useCaptureUi((s) => s.setOpen);
  const { advance } = useTaskActions();

  // Refresh whenever the tab is shown again (after closing a task elsewhere, say), but not more than every 30 s.
  const lastLoad = useRef(0);
  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastLoad.current < 30_000 && useMyDay.getState().data) return;
      lastLoad.current = Date.now();
      load();
      loadStats().catch(() => {});
    }, [load, loadStats]),
  );
  useEffect(() => {
    hydrateStats();
  }, [hydrateStats]);

  const today = todayKey();
  const tasks = useMemo(() => data?.tasks ?? [], [data]);

  const { buckets, dueToday, overdueN, reviewN, tomorrowN } = useMemo(() => {
    const byDue = (t: TaskRow) => relativeDue(t.exp_end_date).days;
    const sortHot = (a: TaskRow, b: TaskRow) => rank(b) - rank(a) || (a.exp_end_date ?? '').localeCompare(b.exp_end_date ?? '');
    const overdue = tasks.filter((t) => isOverdue(t, today)).sort(sortHot);
    const todays = tasks.filter((t) => byDue(t) === 0 || (stageOf(t) === 'In Progress' && !isOverdue(t, today))).sort(sortHot);
    const tomorrow = tasks.filter((t) => byDue(t) === 1);
    const week = tasks.filter((t) => (byDue(t) ?? 0) >= 2 && (byDue(t) ?? 0) < 7);
    const list: Bucket[] = [
      { key: 'overdue', title: 'Overdue', tasks: overdue, filter: 'overdue' },
      { key: 'today', title: 'Today', tasks: todays, filter: 'today' },
      { key: 'tomorrow', title: 'Tomorrow', tasks: tomorrow, filter: 'tomorrow' },
      { key: 'week', title: 'Later this week', tasks: week, filter: 'week' },
    ].filter((b) => b.tasks.length > 0);
    return {
      buckets: list,
      dueToday: todays.length,
      overdueN: overdue.length,
      tomorrowN: tomorrow.length,
      reviewN: tasks.filter((t) => stageOf(t) === 'In Review').length,
    };
  }, [tasks, today]);

  const doneWeek = data?.progress.completed_this_week ?? 0;
  const donePrev = data?.progress.completed_prev_week ?? 0;
  const firstName = (fullName || '').split(' ')[0] || 'there';

  const nextMeeting = useMemo(() => {
    const now = new Date();
    return (data?.meetings ?? []).find((m) => new Date(m.starts_on.replace(' ', 'T')) >= now) ?? null;
  }, [data]);

  const goWork = (filter: string) => router.push({ pathname: '/backlog', params: { due: filter, mine: '1' } });

  const streakPill = (
    <Pressable onPress={() => router.push('/achievements' as never)} style={s.streak} accessibilityRole="button" accessibilityLabel={`Streak ${stats?.streak ?? 0} days. Open achievements`}>
      <Ionicons name="flame" size={18} color={(stats?.streak ?? 0) > 0 ? '#F97316' : COLORS.textMuted} />
      <Text style={s.streakText}>{stats?.streak ?? 0}</Text>
      {stats && stats.points_week > 0 ? <Text style={s.streakPts}>{stats.points_week} pts</Text> : null}
    </Pressable>
  );

  const renderTask = (t: TaskRow, last: boolean) => {
    const stage = stageOf(t);
    const next = NEXT_STAGE[stage];
    const due = relativeDue(t.exp_end_date);
    const stageLabel = stage === 'In Progress' ? 'In progress' : stage === 'In Review' ? 'In review' : null;
    return (
      <View key={t.name} style={[s.task, !last && s.taskDivider]}>
        {/* Two sibling buttons (not nested): the circle moves the task forward, the text opens it. */}
        <Pressable
          onPress={() => advance(t.name, stage)}
          disabled={!next}
          style={s.circle}
          accessibilityRole="button"
          accessibilityLabel={next ? `${t.subject}. Move to ${next}` : t.subject}
        >
          <Ionicons
            name={stage === 'Todo' ? 'ellipse-outline' : stage === 'In Review' ? 'checkmark-circle-outline' : 'play-circle'}
            size={30}
            color={stage === 'In Progress' ? '#2563EB' : COLORS.text}
          />
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.taskBody, pressed && { opacity: 0.6 }]}
          onPress={() => router.push(`/task/${t.name}` as never)}
          accessibilityRole="button"
          accessibilityLabel={t.subject}
        >
          <Text style={s.taskTitle} numberOfLines={2}>{t.subject}</Text>
          <View style={s.meta}>
            {due.tone !== 'none' ? <Pill label={due.label} tone={TONE[due.tone]} /> : null}
            <Text style={s.metaText} numberOfLines={1}>{[stageLabel, t.priority].filter(Boolean).join(' · ')}</Text>
          </View>
        </Pressable>
      </View>
    );
  };

  const firstLoad = loading && !data;

  return (
    <Screen tab title="Today" headerRight={streakPill} onRefresh={async () => { lastLoad.current = Date.now(); await Promise.all([load(), loadStats().catch(() => null)]); }} error={!data ? error : null} onRetry={load}>
      <UnlockCard badges={unlocked} onDismiss={dismissUnlock} />
      <Text style={s.hello}>Hi {firstName}, it is {format(new Date(), 'EEEE d MMMM')}</Text>

      {firstLoad ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={116} style={{ borderRadius: 24 }} />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Skeleton height={76} style={{ flex: 1, borderRadius: 20 }} />
            <Skeleton height={76} style={{ flex: 1, borderRadius: 20 }} />
            <Skeleton height={76} style={{ flex: 1, borderRadius: 20 }} />
          </View>
          <Skeleton height={150} style={{ borderRadius: 24 }} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      ) : (
        <>
          <Pressable style={s.hero} onPress={() => goWork('today')} accessibilityRole="button" accessibilityLabel={`${dueToday} to do today. Open today's work`}>
            <Ionicons name="checkmark-done" size={110} color="rgba(255,255,255,0.06)" style={s.heroGhost} />
            <Text style={s.chip}>TO DO TODAY</Text>
            <Text style={s.heroNum} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.6}>{dueToday}</Text>
            <ProgressBar scale={1} trackColor="rgba(255,255,255,0.18)" fillColor="#86EFAC" value={donePrev ? doneWeek / donePrev : doneWeek > 0 ? 1 : 0} />
            <Text style={s.heroSub}>
              {doneWeek} closed this week{donePrev ? `, ${donePrev} last week` : ''}
            </Text>
          </Pressable>

          <View style={s.tiles}>
            <Tile label="OVERDUE" value={overdueN} hot={overdueN > 0} onPress={() => goWork('overdue')} />
            <Tile label="IN REVIEW" value={reviewN} onPress={() => goWork('review')} />
            <Tile label="TOMORROW" value={tomorrowN} onPress={() => goWork('tomorrow')} />
          </View>

          {stats ? <ProgressCard data={stats} onSeeAll={() => router.push('/achievements' as never)} /> : <Skeleton height={150} style={{ borderRadius: 24, marginBottom: spacing.md }} />}

          {nextMeeting ? (
            <Card style={s.meeting}>
              <View style={s.meetingRow}>
                <Ionicons name="videocam-outline" size={22} color={COLORS.text} />
                <View style={{ flex: 1 }}>
                  <Text style={s.meetingTitle} numberOfLines={1}>{nextMeeting.subject}</Text>
                  <Text style={s.meetingSub}>
                    {timeOf(nextMeeting.starts_on)}
                    {(() => {
                      const mins = differenceInMinutes(new Date(nextMeeting.starts_on.replace(' ', 'T')), new Date());
                      return mins >= 0 && mins < 120 ? ` · in ${mins < 60 ? `${mins} min` : `${Math.round(mins / 60)} h`}` : '';
                    })()}
                  </Text>
                </View>
                {nextMeeting.google_meet_link ? (
                  <Button size="sm" label="Join" onPress={() => Linking.openURL(nextMeeting.google_meet_link as string)} />
                ) : null}
              </View>
            </Card>
          ) : null}

          {tasks.length === 0 ? (
            <Card>
              <View style={s.empty}>
                <Ionicons name="happy-outline" size={40} color={COLORS.textMuted} />
                <Text style={s.emptyTitle}>You are clear</Text>
                <Text style={s.emptyBody}>Nothing is assigned to you. Capture something you noticed, or check the backlog.</Text>
                <Button label="Capture something" iconLeft="add" onPress={() => setCaptureOpen(true)} style={{ alignSelf: 'stretch' }} />
              </View>
            </Card>
          ) : null}

          {buckets.map((b) => (
            <Card key={b.key} title={`${b.title} (${b.tasks.length})`}>
              {b.tasks.slice(0, SHOW).map((t, i, arr) => renderTask(t, i === arr.length - 1 && b.tasks.length <= SHOW))}
              {b.tasks.length > SHOW ? (
                <Row title={`See all ${b.tasks.length}`} onPress={() => goWork(b.filter)} chevron titleLines={1} />
              ) : null}
            </Card>
          ))}

          {stats ? (
            <>
              <Collapsible title="Badges" meta={`${stats.badges.filter((b) => b.earned).length}/${stats.badges.length}`} defaultOpen>
                <BadgeScroller badges={stats.badges} />
              </Collapsible>
              <Collapsible title="Top contributors this week">
                <MiniLeaderboard board={stats.leaderboard} email={email} />
              </Collapsible>
            </>
          ) : null}

          {tasks.length > 0 && dueToday === 0 && overdueN === 0 ? (
            <Text style={s.calm}>Nothing is due today. Pick something from the backlog when you are ready.</Text>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Tile({ label, value, hot, onPress }: { label: string; value: number; hot?: boolean; onPress: () => void }) {
  return (
    <Pressable style={[s.tile, hot && s.tileHot]} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${value} ${label.toLowerCase()}`}>
      <Text style={[s.chip, hot && { color: '#FECACA' }]}>{label}</Text>
      <Text style={[s.tileNum, hot && { color: '#FCA5A5' }]}>{value.toLocaleString()}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  hello: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, marginBottom: spacing.md },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: spacing.sm },
  streakText: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: COLORS.text },
  streakPts: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted },
  hero: { backgroundColor: '#052E16', borderRadius: 24, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, marginBottom: spacing.sm, overflow: 'hidden', gap: 2 },
  heroGhost: { position: 'absolute', right: -10, top: -10 },
  chip: { fontFamily: fontFamily.medium, fontSize: 10, letterSpacing: 1.2, color: '#86EFAC' },
  heroNum: { fontFamily: fontFamily.bold, fontSize: 36, color: '#fff', lineHeight: 42 },
  heroSub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: '#BBF7D0' },
  tiles: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  tile: { flex: 1, minHeight: 64, backgroundColor: COLORS.text, borderRadius: 20, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, justifyContent: 'space-between' },
  tileHot: { backgroundColor: '#3B0A0A' },
  tileNum: { fontFamily: fontFamily.bold, fontSize: 24, color: '#fff' },
  task: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 64 },
  taskDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  taskBody: { flex: 1, paddingVertical: spacing.sm, gap: 4 },
  taskTitle: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  metaText: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, flexShrink: 1 },
  circle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  meeting: { paddingVertical: spacing.md },
  meetingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  meetingTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  meetingSub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  emptyTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text },
  emptyBody: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, textAlign: 'center', marginBottom: spacing.sm },
  calm: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, textAlign: 'center', marginTop: spacing.sm },
});
