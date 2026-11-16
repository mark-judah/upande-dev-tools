import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '@/core/ui/Dialog';
import { Button } from '@/core/ui/Button';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import type { Stage } from '@/features/shared/types';
import { moveTargets, type Item } from './model';

export function openItem(i: Item) {
  if (i.doctype === 'Task') router.push(`/task/${i.name}` as never);
  else if (i.doctype === 'Request') router.push(`/request/${i.name}` as never);
}

/** "Move to..." for one item (long-press or the card's menu). Requests cannot move: the sheet says so. */
export function MoveSheet({
  item,
  onClose,
  onMove,
}: {
  item: Item | null;
  onClose: () => void;
  onMove: (item: Item, to: Stage) => void;
}) {
  const targets = item ? moveTargets(item) : [];
  return (
    <BottomSheet visible={!!item} onClose={onClose} title="Move to..." subtitle={item?.title}>
      {item ? (
        <View>
          {targets.length === 0 ? (
            <Text style={s.note}>Requests move through their review workflow, not the board.</Text>
          ) : (
            targets.map((t) => {
              const current = t === item.stage;
              return (
                <Pressable
                  key={t}
                  disabled={current}
                  onPress={() => onMove(item, t)}
                  accessibilityRole="button"
                  accessibilityLabel={`Move to ${t}`}
                  accessibilityState={{ disabled: current, selected: current }}
                  style={({ pressed }) => [s.row, pressed && { backgroundColor: COLORS.bgMuted }]}
                >
                  <Text style={[s.label, current && { color: COLORS.textMuted }]}>{t}</Text>
                  {current ? <Ionicons name="checkmark" size={20} color={COLORS.textMuted} /> : null}
                </Pressable>
              );
            })
          )}
          {item.doctype !== 'Issue' ? (
            <Button
              label={`Open ${item.doctype.toLowerCase()}`}
              variant="outline"
              style={{ marginTop: spacing.md }}
              onPress={() => {
                onClose();
                openItem(item);
              }}
            />
          ) : null}
        </View>
      ) : null}
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  label: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
  note: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, paddingVertical: spacing.md },
});
