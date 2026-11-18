import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BottomSheet } from '@/core/ui/Dialog';
import { ProgressBar } from '@/core/ui/ProgressBar';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { levelOf, OVERDUE_BONUS, PRIORITY_POINTS, type Achievements, type Badge, type Contributor } from './achievements-api';

const DAYS = ['M', 'T', 'W', 'T', 'F'];
const ORANGE = '#FB923C';

/** Local YYYY-MM-DD, the same shape the server sends in `week_days`. */
function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Which of Monday to Friday this week I closed something on. Falls back to the streak when the server omits dates. */
function closedWeekdays(data: Achievements): boolean[] {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const days = DAYS.map((_, i) => isoLocal(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)));
  if (data.week_days) return days.map((d) => data.week_days!.includes(d));
  const todayIdx = Math.min((now.getDay() + 6) % 7, 4);
  const end = data.closed_today > 0 || todayIdx === 0 ? todayIdx : todayIdx - 1;
  return days.map((_, i) => data.streak > 0 && i <= end && i > end - data.streak);
}

/** A number that counts up to its new value and pulses when it changes (skipped on first render). */
function useTick(value: number) {
  const [shown, setShown] = useState(value);
  const scale = useState(() => new Animated.Value(1))[0];
  const prev = useRef(value);
  const count = useState(() => new Animated.Value(value))[0];
  useEffect(() => {
    const id = count.addListener(({ value: v }) => setShown(Math.round(v)));
    return () => count.removeListener(id);
  }, [count]);
  useEffect(() => {
    if (prev.current === value) return;
    const grew = value > prev.current;
    prev.current = value;
    Animated.timing(count, { toValue: value, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    if (grew) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.3, duration: 180, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start();
    }
  }, [value, count, scale]);
  return { shown, scale };
}

export function RulesSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="How points work">
      <Text style={s.ruleHead}>Points per closed task</Text>
      <View style={s.ruleGrid}>
        {PRIORITY_POINTS.map(([label, pts]) => (
          <View key={label} style={s.rulePill}>
            <Text style={s.rulePillText} numberOfLines={1}>{label} +{pts}</Text>
          </View>
        ))}
      </View>
      <Text style={s.ruleBody}>Closing a task after its due date still counts, with a bonus of +{OVERDUE_BONUS} for clearing it.</Text>
      <Text style={s.ruleHead}>Streak</Text>
      <Text style={s.ruleBody}>Close at least one task on a weekday to keep your streak. Weekends never break it, and closing on a weekend does not add to it.</Text>
      <Text style={s.ruleHead}>Levels and badges</Text>
      <Text style={s.ruleBody}>Total points raise your level. Badges unlock for milestones such as five weekdays in a row or clearing five overdue tasks.</Text>
    </BottomSheet>
  );
}

/** Points this week, the Mon to Fri flame row and the bar to the next level. */
export function ProgressCard({ data, onSeeAll }: { data: Achievements; onSeeAll?: () => void }) {
  const [rules, setRules] = useState(false);
  const { shown, scale } = useTick(data.points_week);
  const done = closedWeekdays(data);
  const { level, from, to } = levelOf(data.points_total);
  const todayIdx = (new Date().getDay() + 6) % 7;
  const toGo = to - data.points_total;
  return (
    <View style={s.card}>
      <View style={s.cardTop}>
        <View style={{ flex: 1 }}>
          <View style={s.chipRow}>
            <Text style={s.cardChip} numberOfLines={1}>POINTS THIS WEEK</Text>
            <Pressable onPress={() => setRules(true)} style={s.info} accessibilityRole="button" accessibilityLabel="How points work">
              <Ionicons name="information-circle-outline" size={18} color="#BBF7D0" />
            </Pressable>
          </View>
          <Animated.Text style={[s.cardNum, { transform: [{ scale }] }]} numberOfLines={1}>
            {shown.toLocaleString()}
          </Animated.Text>
        </View>
        <View style={s.streakCol}>
          <View style={s.streakLine}>
            <Ionicons name="flame" size={18} color={data.streak > 0 ? ORANGE : '#4ADE80'} />
            <Text style={s.streakText} numberOfLines={1}>
              {data.streak > 0 ? `${data.streak} day streak` : 'No streak yet'}
            </Text>
          </View>
          <View style={s.dots} accessibilityLabel={`Closed on ${done.filter(Boolean).length} of 5 weekdays this week`}>
            {DAYS.map((d, i) => (
              <View key={i} style={s.dotCol}>
                <View style={[s.dot, done[i] && s.dotOn, i === todayIdx && !done[i] && s.dotToday]}>
                  {done[i] ? <Ionicons name="flame" size={11} color="#052E16" /> : null}
                </View>
                <Text style={s.dotLabel}>{d}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
      <ProgressBar scale={1} trackColor="rgba(255,255,255,0.18)" fillColor="#86EFAC" value={(data.points_total - from) / (to - from)} />
      <View style={s.levelRow}>
        <Text style={s.levelText} numberOfLines={1}>Level {level} · {toGo} pts to go</Text>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll} style={s.action} accessibilityRole="button" accessibilityLabel="See all achievements">
            <Text style={s.actionText} numberOfLines={1}>See all</Text>
            <Ionicons name="chevron-forward" size={16} color="#BBF7D0" />
          </Pressable>
        ) : null}
      </View>
      <RulesSheet visible={rules} onClose={() => setRules(false)} />
    </View>
  );
}

function badgeIcon(b: Badge): keyof typeof Ionicons.glyphMap {
  return b.earned ? 'ribbon' : 'lock-closed-outline';
}

function progressText(b: Badge): string | null {
  if (!b.progress || b.earned || b.progress.target <= 1) return null;
  const unit = b.key === 'streak_5' ? ' weekdays' : '';
  return `${b.progress.current}/${b.progress.target}${unit}`;
}

function BadgeChip({ b }: { b: Badge }) {
  const pt = progressText(b);
  return (
    <View
      style={[s.badge, b.earned ? s.badgeOn : s.badgeOff]}
      accessible
      accessibilityLabel={`${b.label}. ${b.earned ? 'Earned' : 'Locked'}. ${b.description}${pt ? ` ${pt}` : ''}`}
    >
      <Ionicons name={badgeIcon(b)} size={24} color={b.earned ? COLORS.success : COLORS.textMuted} />
      <Text style={s.badgeLabel} numberOfLines={1}>{b.label}</Text>
      <Text style={s.badgeHint} numberOfLines={2}>{b.description}</Text>
      {pt ? <Text style={s.badgeProg} numberOfLines={1}>{pt}</Text> : <Text style={s.badgeProg} numberOfLines={1}>{b.earned ? 'Earned' : ' '}</Text>}
      {b.progress && !b.earned && b.progress.target > 1 ? (
        <ProgressBar scale={1} value={b.progress.current / b.progress.target} />
      ) : null}
    </View>
  );
}

/** Earned badges in full colour, locked ones dimmed with progress, sideways. */
export function BadgeScroller({ badges }: { badges: Badge[] }) {
  if (badges.length === 0) return <Text style={s.empty}>No badges yet.</Text>;
  const sorted = [...badges].sort((a, b) => Number(b.earned) - Number(a.earned));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.scroller} style={s.scrollerWrap}>
      {sorted.map((b) => <BadgeChip key={b.key} b={b} />)}
    </ScrollView>
  );
}

/** Full-width grid used on the detailed screen. */
export function BadgeGrid({ badges }: { badges: Badge[] }) {
  if (badges.length === 0) return <Text style={s.empty}>No badges yet.</Text>;
  return (
    <View style={s.grid}>
      {badges.map((b) => (
        <View key={b.key} style={s.gridCell}>
          <BadgeChip b={b} />
        </View>
      ))}
    </View>
  );
}

/** Top three contributors, plus you at your real rank when you are further down. Nobody is listed as last. */
export function MiniLeaderboard({ board, email, limit = 3 }: { board: Contributor[]; email: string | null; limit?: number }) {
  const ranked = board.filter((c) => c.points > 0);
  if (ranked.length === 0) return <Text style={s.empty}>Nobody has closed a task this week yet. Be the first.</Text>;
  const rows = ranked.slice(0, limit).map((c, i) => ({ c, rank: i + 1 }));
  const myIdx = email ? ranked.findIndex((c) => c.user === email) : -1;
  if (myIdx >= limit) rows.push({ c: ranked[myIdx], rank: myIdx + 1 });
  return (
    <View>
      {rows.map(({ c, rank }) => {
        const me = !!email && c.user === email;
        return (
          <View key={c.user} style={[s.lbRow, me && s.lbMe]} accessible accessibilityLabel={`${rank}. ${c.full_name || c.user}${me ? ', you' : ''}, ${c.points} points`}>
            <Text style={s.rank}>{rank}</Text>
            <Text style={[s.lbName, me && s.lbNameMe]} numberOfLines={1}>{c.full_name || c.user}{me ? ' (you)' : ''}</Text>
            <Text style={s.lbPts} numberOfLines={1}>{c.points} pts</Text>
          </View>
        );
      })}
    </View>
  );
}

/** A card whose body folds away; the header is a 44 px button. */
export function Collapsible({ title, meta, defaultOpen = false, children }: { title: string; meta?: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={s.coll}>
      <Pressable onPress={() => setOpen((o) => !o)} style={s.collHead} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${title}${meta ? `, ${meta}` : ''}`}>
        <Text style={s.collTitle} numberOfLines={1}>{title}</Text>
        {meta ? <Text style={s.collMeta} numberOfLines={1}>{meta}</Text> : null}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.textMuted} />
      </Pressable>
      {open ? <View style={s.collBody}>{children}</View> : null}
    </View>
  );
}

const SEEN_KEY = 'badges_seen';

/**
 * Badges that became earned since the last load. The first ever load only records what is already earned, so old
 * badges are not celebrated. Each unlock is shown once.
 */
export function useBadgeUnlocks(data: Achievements | null) {
  const [unlocked, setUnlocked] = useState<Badge[]>([]);
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    (async () => {
      try {
        const earned = data.badges.filter((b) => b.earned);
        const raw = await AsyncStorage.getItem(SEEN_KEY);
        const seen: string[] = raw ? JSON.parse(raw) : [];
        const fresh = raw === null ? [] : earned.filter((b) => !seen.includes(b.key));
        if (raw === null || fresh.length > 0) await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(earned.map((b) => b.key)));
        if (!cancelled && fresh.length > 0) setUnlocked(fresh);
      } catch {
        // celebrating twice beats crashing
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data]);
  return { unlocked, dismiss: () => setUnlocked([]) };
}

/** Slides in once per newly earned badge, then leaves on its own. */
export function UnlockCard({ badges, onDismiss }: { badges: Badge[]; onDismiss: () => void }) {
  const anim = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    if (badges.length === 0) return;
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, friction: 6, useNativeDriver: true }).start();
    const t = setTimeout(onDismiss, 7000);
    return () => clearTimeout(t);
  }, [badges, anim, onDismiss]);
  if (badges.length === 0) return null;
  const first = badges[0];
  return (
    <Animated.View
      style={[s.unlock, { opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }, { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] }]}
      accessibilityLiveRegion="polite"
    >
      <Ionicons name="trophy" size={28} color="#FACC15" />
      <View style={{ flex: 1 }}>
        <Text style={s.unlockChip} numberOfLines={1}>BADGE UNLOCKED</Text>
        <Text style={s.unlockTitle} numberOfLines={1}>{badges.length > 1 ? `${first.label} and ${badges.length - 1} more` : first.label}</Text>
      </View>
      <Pressable onPress={onDismiss} style={s.unlockClose} accessibilityRole="button" accessibilityLabel="Dismiss">
        <Ionicons name="close" size={20} color="#fff" />
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#052E16', borderRadius: borderRadius.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs, marginBottom: spacing.md, overflow: 'hidden', gap: spacing.xs },
  chipRow: { flexDirection: 'row', alignItems: 'center' },
  info: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginVertical: -12 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  cardChip: { fontFamily: fontFamily.medium, fontSize: 10, letterSpacing: 0.6, color: '#86EFAC' },
  cardNum: { fontFamily: fontFamily.bold, fontSize: 36, lineHeight: 42, color: '#fff' },
  streakCol: { alignItems: 'flex-end', gap: spacing.xs },
  streakLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  streakText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: '#BBF7D0' },
  dots: { flexDirection: 'row', gap: 6 },
  dotCol: { alignItems: 'center', gap: 2 },
  dot: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  dotOn: { backgroundColor: ORANGE },
  dotToday: { borderWidth: 1.5, borderColor: '#86EFAC', backgroundColor: 'transparent' },
  dotLabel: { fontFamily: fontFamily.medium, fontSize: 10, color: '#86EFAC' },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  levelText: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: '#BBF7D0', flexShrink: 1 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, marginVertical: -8 },
  actionText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: '#BBF7D0' },

  ruleHead: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text, marginTop: spacing.sm },
  ruleBody: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary, lineHeight: 19 },
  ruleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rulePill: { alignSelf: 'flex-start', backgroundColor: COLORS.surfaceAlt, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 6 },
  rulePillText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text },

  scrollerWrap: { marginHorizontal: -spacing.lg },
  scroller: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  badge: { width: 150, borderRadius: borderRadius.lg, padding: spacing.md, gap: 4, alignSelf: 'flex-start' },
  badgeOn: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0' },
  badgeOff: { backgroundColor: COLORS.surfaceAlt, opacity: 0.6 },
  badgeLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  badgeHint: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, minHeight: 30 },
  badgeProg: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridCell: { width: '48%', flexGrow: 1 },

  lbRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44, paddingHorizontal: spacing.sm, borderRadius: 12 },
  lbMe: { backgroundColor: '#F0FDF4' },
  rank: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: COLORS.textMuted, width: 24 },
  lbName: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
  lbNameMe: { fontFamily: fontFamily.semiBold },
  lbPts: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: COLORS.text },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },

  coll: { backgroundColor: COLORS.surface, borderRadius: borderRadius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, marginBottom: spacing.md, paddingHorizontal: spacing.lg },
  collHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52 },
  collTitle: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text, textTransform: 'uppercase', letterSpacing: 0.4 },
  collMeta: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textMuted },
  collBody: { paddingBottom: spacing.lg },

  unlock: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: COLORS.text, borderRadius: borderRadius.xl, paddingLeft: spacing.lg, paddingVertical: spacing.sm, marginBottom: spacing.md },
  unlockChip: { fontFamily: fontFamily.medium, fontSize: 10, letterSpacing: 0.6, color: '#FACC15' },
  unlockTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: '#fff' },
  unlockClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
