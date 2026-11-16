import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '@/core/ui/Dialog';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import type { BulkProgress, BulkValues } from './useBacklog';
import { dueChoices, PRIORITIES } from './model';

type Props = {
  count: number;
  total: number;
  progress: BulkProgress;
  onApply: (v: BulkValues, label: string) => void;
  onSelectAll: () => void;
  onCancel: () => void;
};

function Act({ icon, label, onPress, disabled }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[s.act, disabled && { opacity: 0.4 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Ionicons name={icon} size={18} color="#fff" />
      <Text style={s.actText} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/** Bottom action bar shown in select mode. Every action applies to all selected rows at once. */
export function BulkBar({ count, total, progress, onApply, onSelectAll, onCancel }: Props) {
  const [sheet, setSheet] = useState<'due' | 'priority' | null>(null);
  const none = count === 0 || !!progress;
  return (
    <View style={s.bar}>
      <View style={s.top}>
        <Pressable onPress={onCancel} style={s.close} accessibilityRole="button" accessibilityLabel="Leave select mode">
          <Ionicons name="close" size={22} color="#fff" />
        </Pressable>
        <Text style={s.count} numberOfLines={1}>{progress ? `${progress.label} ${progress.done}/${progress.total}` : `${count} selected`}</Text>
        {progress ? <ActivityIndicator color="#fff" style={{ marginRight: spacing.md }} /> : null}
        <Pressable onPress={onSelectAll} style={s.link} accessibilityRole="button" accessibilityLabel={`Select all ${total}`}>
          <Text style={s.linkText} numberOfLines={1}>{count === total ? 'None' : `All ${total}`}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.acts}>
        <Act icon="checkmark-circle" label="Done" disabled={none} onPress={() => onApply({ stage: 'Done' }, 'Done')} />
        <Act icon="play" label="WIP" disabled={none} onPress={() => onApply({ stage: 'In Progress' }, 'In progress')} />
        <Act icon="person-add-outline" label="Assign to me" disabled={none} onPress={() => onApply({ assignMe: true }, 'Assigned to you')} />
        <Act icon="calendar-outline" label="Set due" disabled={none} onPress={() => setSheet('due')} />
        <Act icon="flag-outline" label="Priority" disabled={none} onPress={() => setSheet('priority')} />
      </ScrollView>

      <BottomSheet visible={sheet === 'due'} onClose={() => setSheet(null)} title="Set due date" subtitle={`${count} selected`}>
        <View style={s.chips}>
          {dueChoices().map((c) => (
            <Pressable
              key={c.label}
              style={s.choice}
              accessibilityRole="button"
              accessibilityLabel={`Due ${c.label}`}
              onPress={() => {
                setSheet(null);
                onApply({ end: c.value }, `Due ${c.label.toLowerCase()}`);
              }}
            >
              <Text style={s.choiceText} numberOfLines={1}>{c.label}</Text>
            </Pressable>
          ))}
        </View>
      </BottomSheet>
      <BottomSheet visible={sheet === 'priority'} onClose={() => setSheet(null)} title="Set priority" subtitle={`${count} selected`}>
        <View style={s.chips}>
          {PRIORITIES.map((p) => (
            <Pressable
              key={p}
              style={s.choice}
              accessibilityRole="button"
              accessibilityLabel={`Priority ${p}`}
              onPress={() => {
                setSheet(null);
                onApply({ priority: p }, `Priority ${p}`);
              }}
            >
              <Text style={s.choiceText} numberOfLines={1}>{p}</Text>
            </Pressable>
          ))}
        </View>
      </BottomSheet>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { position: 'absolute', left: spacing.md, right: 84, bottom: spacing.md, backgroundColor: COLORS.text, borderRadius: 24, paddingTop: spacing.xs, paddingBottom: spacing.sm, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  top: { flexDirection: 'row', alignItems: 'center' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  count: { flex: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: '#fff' },
  link: { minHeight: 44, paddingHorizontal: spacing.md, justifyContent: 'center' },
  linkText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: '#86EFAC' },
  acts: { gap: spacing.sm, paddingHorizontal: spacing.md },
  act: { alignSelf: 'flex-start', flexShrink: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)' },
  actText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: '#fff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingVertical: spacing.sm },
  choice: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: spacing.lg, justifyContent: 'center', borderRadius: 999, backgroundColor: COLORS.bgMuted },
  choiceText: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
});
