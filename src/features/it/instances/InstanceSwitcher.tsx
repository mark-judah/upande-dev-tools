import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActiveInstance, useItInstances } from '@/core/it-source/instances-store';
import { instanceTitle } from '@/core/it-source/instances-model';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { openInstancePicker } from './picker-ui';

/**
 * The compact bar under every IT screen's header: which instance the data comes from, with a dot for its session.
 * Tapping opens the instance sheet to switch, add, sign in again, rename or remove.
 */
export function InstanceSwitcher() {
  const hydrate = useItInstances((s) => s.hydrate);
  const count = useItInstances((s) => s.list.length);
  const active = useActiveInstance();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const expired = active?.status === 'expired';
  const label = active ? instanceTitle(active) : count ? 'Choose an instance' : 'Add an IT instance';
  return (
    <Pressable
      onPress={() => openInstancePicker(active || count ? { kind: 'list' } : { kind: 'add' })}
      style={({ pressed }) => [s.bar, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={active ? `IT instance ${label}${expired ? ', session expired' : ''}. Switch instance` : label}
    >
      <View style={[s.dot, { backgroundColor: !active ? COLORS.textMuted : expired ? COLORS.warn : COLORS.success }]} />
      <Text style={s.caption}>Instance</Text>
      <Text style={s.label} numberOfLines={1}>
        {label}
        {expired ? ' · sign in again' : ''}
      </Text>
      <Ionicons name="chevron-down" size={16} color={COLORS.textSecondary} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 36 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  caption: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  label: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text },
});
