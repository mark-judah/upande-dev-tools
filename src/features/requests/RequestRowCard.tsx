import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { Pill, priorityTone } from '@/features/shared/Pill';
import { age, toneFor, type RequestRow } from './model';

type Props = {
  item: RequestRow;
  mine: boolean;
  onPress: () => void;
  onMenu?: () => void;
};

function RequestRowCardBase({ item, mine, onPress, onMenu }: Props) {
  const tone = toneFor(item.workflow_state);
  const who = mine ? 'you' : item.raised_by_name || item.owner;
  const assignee = item.assignees?.[0];
  const tags = (item.tags ?? []).filter((t) => t !== item.request_type).slice(0, 2);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onMenu}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${item.workflow_state}`}
      style={({ pressed }) => [s.card, pressed && { backgroundColor: COLORS.bgMuted }]}
    >
      <View style={s.top}>
        <Text style={s.title} numberOfLines={2}>{item.title}</Text>
        {onMenu ? (
          <Pressable onPress={onMenu} hitSlop={8} style={s.menu} accessibilityRole="button" accessibilityLabel="More actions">
            <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <View style={s.pills}>
        <View style={[s.state, { backgroundColor: tone.bg }]}>
          <Text style={[s.stateText, { color: tone.fg }]}>{item.workflow_state}</Text>
        </View>
        {item.request_type ? <Pill label={item.request_type} tone="neutral" /> : null}
        {item.priority ? <Pill label={item.priority} tone={priorityTone(item.priority)} /> : null}
      </View>

      <View style={s.meta}>
        <Text style={s.metaText} numberOfLines={1}>
          <Text style={mine ? s.you : undefined}>{who}</Text>
          {` · ${age(item.creation)}`}
        </Text>
        <Text style={s.id}>{item.name.replace('REQ-', '')}</Text>
      </View>

      {item.linked_task ? (
        <View style={s.task}>
          <Ionicons name="git-branch-outline" size={14} color={COLORS.textSecondary} />
          <Text style={s.taskText} numberOfLines={1}>
            Task {item.linked_task.replace('TASK-', '')}
            {assignee ? ` · ${assignee}` : ''}
          </Text>
        </View>
      ) : null}

      {tags.length ? (
        <View style={s.tags}>
          {tags.map((t) => (
            <Text key={t} style={s.tag}>#{t}</Text>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

export const RequestRowCard = memo(RequestRowCardBase);


const s = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text, lineHeight: 21 },
  menu: { width: 32, height: 32, marginTop: -4, marginRight: -6, alignItems: 'center', justifyContent: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs + 2 },
  state: { borderRadius: 999, paddingHorizontal: spacing.sm + 2, paddingVertical: 3 },
  stateText: { fontFamily: fontFamily.semiBold, fontSize: 12 },
  meta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  metaText: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  you: { fontFamily: fontFamily.semiBold, color: COLORS.text },
  id: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  task: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.bgMuted, borderRadius: borderRadius.sm, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  taskText: { flex: 1, fontFamily: fontFamily.medium, fontSize: 12, color: COLORS.textSecondary },
  tags: { flexDirection: 'row', gap: spacing.sm },
  tag: { fontFamily: fontFamily.regular, fontSize: 12, color: COLORS.textMuted },
});
