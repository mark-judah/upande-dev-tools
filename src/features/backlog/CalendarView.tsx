import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { todayKey } from '@/core/date';
import { Segmented } from '@/core/ui/Segmented';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import type { Stage } from '@/features/shared/types';
import { ItemRow } from './ItemRow';
import { itemKey, priorityColor, type Item } from './model';

const WEEK_OPTS = [
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
] as const;
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function CalendarView({
  items,
  projectName,
  onOpen,
  onAdvance,
  onMove,
  onMenu,
  onRefresh,
  refreshing,
}: {
  items: Item[];
  projectName: (i: Item) => string | undefined;
  onOpen: (i: Item) => void;
  onAdvance: (i: Item) => void;
  onMove: (i: Item, to: Stage) => void;
  onMenu: (i: Item) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const today = todayKey();
  const [cursor, setCursor] = useState(() => new Date());
  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [selected, setSelected] = useState(today);

  const byDay = useMemo(() => {
    const m: Record<string, Item[]> = {};
    for (const i of items) {
      if (!i.end) continue;
      (m[i.end] ??= []).push(i);
    }
    return m;
  }, [items]);
  const undated = useMemo(() => items.filter((i) => !i.end).length, [items]);
  const overdue = useMemo(() => items.filter((i) => i.late), [items]);

  const days = useMemo(() => {
    const from = mode === 'month' ? startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }) : startOfWeek(cursor, { weekStartsOn: 1 });
    const to = mode === 'month' ? endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }) : endOfWeek(cursor, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: from, end: to });
  }, [cursor, mode]);

  const step = (dir: 1 | -1) => setCursor((c) => (mode === 'month' ? addMonths(c, dir) : addWeeks(c, dir)));
  const goToday = () => {
    setCursor(new Date());
    setSelected(today);
  };

  const dayItems = selected === 'overdue' ? overdue : byDay[selected] ?? [];
  const title =
    mode === 'month'
      ? format(cursor, 'MMMM yyyy')
      : `${format(days[0], 'd MMM')} - ${format(days[days.length - 1], 'd MMM')}`;

  const weeks = Array.from({ length: days.length / 7 }, (_, k) => days.slice(k * 7, k * 7 + 7));

  const header = (
    <View>
      <View style={s.nav}>
        <Pressable onPress={() => step(-1)} style={s.navBtn} accessibilityRole="button" accessibilityLabel="Previous">
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </Pressable>
        <Text style={s.month} numberOfLines={1} accessibilityRole="header">{title}</Text>
        <Pressable onPress={goToday} style={s.todayBtn} accessibilityRole="button" accessibilityLabel="Go to today">
          <Text style={s.todayText}>Today</Text>
        </Pressable>
        <Pressable onPress={() => step(1)} style={s.navBtn} accessibilityRole="button" accessibilityLabel="Next">
          <Ionicons name="chevron-forward" size={22} color={COLORS.text} />
        </Pressable>
      </View>
      <View style={s.toggle}>
        <Segmented value={mode} options={WEEK_OPTS} onChange={setMode} />
      </View>
      {overdue.length > 0 ? (
        <Pressable
          onPress={() => setSelected('overdue')}
          style={[s.banner, selected === 'overdue' && { borderWidth: 1, borderColor: COLORS.danger }]}
          accessibilityRole="button"
          accessibilityLabel={`${overdue.length} overdue items`}
        >
          <View style={s.redDot} />
          <Text style={s.bannerText} numberOfLines={1}>
            {overdue.length} overdue. Tap to list them
          </Text>
        </Pressable>
      ) : null}
      <View style={s.grid}>
        <View style={s.weekRow}>
          {DOW.map((d) => (
            <Text key={d} style={s.dow}>{d}</Text>
          ))}
        </View>
        {weeks.map((w, wi) => (
          <View key={wi} style={s.weekRow}>
            {w.map((d) => {
              const key = format(d, 'yyyy-MM-dd');
              const list = byDay[key] ?? [];
              const isToday = key === today;
              const isSel = key === selected;
              const late = list.some((i) => i.late) || (isToday && overdue.length > 0);
              const dim = mode === 'month' && !isSameMonth(d, cursor);
              const top = list[0];
              return (
                <Pressable
                  key={key}
                  onPress={() => setSelected(key)}
                  style={[s.cell, mode === 'week' && { height: 72 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${format(d, 'EEEE d MMMM')}, ${list.length} items due`}
                  accessibilityState={{ selected: isSel }}
                >
                  <View style={[s.dayNum, isToday && s.dayToday, isSel && !isToday && s.daySel]}>
                    <Text style={[s.dayText, dim && { color: COLORS.border }, isToday && { color: '#fff' }]}>{format(d, 'd')}</Text>
                  </View>
                  {list.length > 0 || (isToday && overdue.length > 0) ? (
                    <View style={s.marks}>
                      <View style={[s.dot, { backgroundColor: late ? COLORS.danger : top && priorityColor(top.priority) !== 'transparent' ? priorityColor(top.priority) : COLORS.text }]} />
                      <Text style={[s.count, late && { color: COLORS.danger }]}>{isToday && overdue.length > 0 ? (list.length ? `${list.length}+${overdue.length}` : `${overdue.length}`) : list.length}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <View style={s.dayHead}>
        <Text style={s.dayTitle}>{selected === 'overdue' ? 'Overdue' : selected === today ? 'Today' : format(new Date(`${selected}T00:00:00`), 'EEEE d MMMM')}</Text>
        <Text style={s.dayCount}>{dayItems.length} {selected === 'overdue' ? 'late' : 'due'}</Text>
      </View>
    </View>
  );

  return (
    <FlatList
      data={dayItems}
      keyExtractor={itemKey}
      ListHeaderComponent={header}
      renderItem={({ item }) => (
        <ItemRow item={item} projectName={projectName(item)} onOpen={onOpen} onAdvance={onAdvance} onMenu={onMenu} onMove={onMove} />
      )}
      ListEmptyComponent={<Text style={s.empty}>Nothing due on this day.</Text>}
      ListFooterComponent={
        undated > 0 ? (
          <Text style={s.foot}>{undated} item{undated === 1 ? ' has' : 's have'} no due date and {undated === 1 ? 'is' : 'are'} not on the calendar. Find {undated === 1 ? 'it' : 'them'} in the List view under No date.</Text>
        ) : undefined
      }
      onRefresh={onRefresh}
      refreshing={refreshing}
      contentContainerStyle={{ paddingBottom: 120 }}
    />
  );
}

const s = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  navBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  month: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text, paddingHorizontal: spacing.sm },
  todayBtn: { minHeight: 44, paddingHorizontal: spacing.md, justifyContent: 'center' },
  todayText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  toggle: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
  },
  redDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.danger },
  bannerText: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: '#991B1B' },
  grid: {
    backgroundColor: COLORS.surface,
    marginHorizontal: spacing.lg,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    paddingBottom: spacing.xs,
    overflow: 'hidden',
  },
  weekRow: { flexDirection: 'row' },
  dow: { flex: 1, textAlign: 'center', paddingVertical: spacing.sm, fontFamily: fontFamily.medium, fontSize: 11, color: COLORS.textMuted },
  cell: { flex: 1, height: 52, alignItems: 'center', paddingTop: 2 },
  dayNum: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  dayToday: { backgroundColor: COLORS.text },
  daySel: { borderWidth: 1.5, borderColor: COLORS.text },
  dayText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text },
  marks: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  count: { fontFamily: fontFamily.medium, fontSize: 10, color: COLORS.textSecondary },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  dayTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  dayCount: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  empty: { textAlign: 'center', fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, padding: spacing.xl },
  foot: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, padding: spacing.lg, textAlign: 'center' },
});
