import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { addDays, format } from 'date-fns';
import { useAuthStore } from '@/core/auth/store';
import { todayKey } from '@/core/date';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Segmented } from '@/core/ui/Segmented';
import { call } from '@/core/api/call';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { useLoad } from '@/features/shared/useLoad';
import { Pill, priorityTone } from '@/features/shared/Pill';
import type { Stage } from '@/features/shared/types';

type Item = {
  doctype: 'Task' | 'Issue' | 'Request';
  name: string;
  title: string;
  stage: Stage;
  priority?: string | null;
  project?: string | null;
  end?: string | null;
  late?: boolean;
  assignee_ids?: string[];
};

type Board = { items: Item[]; total: number; stages: Stage[] };

const VIEWS = [
  { value: 'Active', label: 'Active' },
  { value: 'Triage', label: 'Triage' },
  { value: 'Blocked', label: 'Blocked' },
  { value: 'Done', label: 'Done' },
] as const;
type View_ = (typeof VIEWS)[number]['value'];

const ACTIVE: Stage[] = ['Todo', 'In Progress', 'In Review'];

export function BacklogScreen() {
  const { data, loading, error, reload } = useLoad(() => call<Board>('board.get_board', {}, true));
  const [view, setView] = useState<View_>('Active');

  // Deep links from Today: /backlog?due=overdue|today|tomorrow|week|review&mine=1
  const params = useLocalSearchParams<{ due?: string; mine?: string }>();
  const email = useAuthStore((st) => st.email);
  const due = params.due;
  const mineOnly = params.mine === '1';

  const items = useMemo(() => {
    const all = data?.items ?? [];
    if (due) {
      const today = todayKey();
      const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');
      const weekEnd = format(addDays(new Date(), 6), 'yyyy-MM-dd');
      return all.filter((i) => {
        if (mineOnly && !(i.assignee_ids ?? []).includes(email ?? '')) return false;
        if (i.stage === 'Done') return false;
        if (due === 'overdue') return !!i.late;
        if (due === 'today') return i.end === today || i.stage === 'In Progress';
        if (due === 'tomorrow') return i.end === tomorrow;
        if (due === 'week') return !!i.end && i.end > tomorrow && i.end <= weekEnd;
        if (due === 'review') return i.stage === 'In Review';
        return true;
      });
    }
    return all.filter((i) => (view === 'Active' ? ACTIVE.includes(i.stage) : i.stage === view));
  }, [data, view, due, mineOnly, email]);

  const open = (i: Item) => {
    if (i.doctype === 'Task') router.push(`/task/${i.name}` as never);
    else if (i.doctype === 'Request') router.push(`/request/${i.name}` as never);
  };

  return (
    <Screen tab title="Work" loading={loading && !data} error={!data ? error : null} onRetry={reload} onRefresh={reload}>
      {due ? (
        <Pressable style={st.filter} onPress={() => router.setParams({ due: undefined, mine: undefined })} accessibilityRole="button" accessibilityLabel="Clear filter">
          <Text style={st.filterText}>{mineOnly ? 'Mine · ' : ''}{({ overdue: 'Overdue', today: 'Due today', tomorrow: 'Due tomorrow', week: 'Later this week', review: 'In review' } as Record<string, string>)[due] ?? due} ({items.length})</Text>
          <Ionicons name="close-circle" size={18} color="#fff" />
        </Pressable>
      ) : (
        <Segmented value={view} options={VIEWS} onChange={setView} />
      )}
      <View style={{ height: spacing.md }} />
      {items.length === 0 ? (
        <Card><Text style={s.empty}>Nothing here.</Text></Card>
      ) : (
        items.map((i) => (
          <Pressable key={`${i.doctype}-${i.name}`} onPress={() => open(i)}>
            <Card>
              <Text style={s.title} numberOfLines={2}>{i.title}</Text>
              <View style={s.meta}>
                <Pill label={i.doctype} tone="info" />
                {i.priority ? <Pill label={i.priority} tone={priorityTone(i.priority)} /> : null}
                {i.late ? <Pill label="Overdue" tone="danger" /> : null}
                {i.end ? <Text style={s.date}>{i.end}</Text> : null}
              </View>
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  filter: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.sm, backgroundColor: COLORS.text, borderRadius: 999, paddingHorizontal: spacing.md, minHeight: 40, marginBottom: spacing.md },
  filterText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: '#fff' },
});

const s = StyleSheet.create({
  title: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  date: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
});
