import { Pressable, StyleSheet, Text } from 'react-native';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';

type Props = {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress?: () => void;
};

export function DecisionChip({ label, selected, disabled, onPress }: Props) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      style={({ pressed }) => [
        s.chip,
        selected ? s.chipSelected : null,
        disabled ? s.chipDisabled : null,
        pressed && !disabled && { opacity: 0.85 },
      ]}
    >
      <Text style={[s.label, selected ? s.labelSelected : null]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    minHeight: 44,
  },
  chipSelected: { borderColor: COLORS.text, backgroundColor: COLORS.text },
  chipDisabled: { opacity: 0.4 },
  label: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textMuted },
  labelSelected: { fontFamily: fontFamily.semiBold, color: COLORS.textOnPrimary },
});
