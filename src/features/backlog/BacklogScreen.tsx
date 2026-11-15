import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
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

  const items = useMemo(() => {
    const all = data?.items ?? [];
    return all.filter((i) => (view === 'Active' ? ACTIVE.includes(i.stage) : i.stage === view));
  }, [data, view]);

  const open = (i: Item) => {
    if (i.doctype === 'Task') router.push(`/task/${i.name}` as never);
    else if (i.doctype === 'Request') router.push(`/request/${i.name}` as never);
  };

  return (
    <Screen title="Backlog" loading={loading && !data} error={!data ? error : null} onRetry={reload} onRefresh={reload}>
      <Segmented value={view} options={VIEWS} onChange={setView} />
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

const s = StyleSheet.create({
  title: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  date: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  empty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
});
