import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, fontFamily, spacing } from '@/core/theme';

export type ChipTone = 'neutral' | 'danger' | 'warn' | 'info' | 'success' | 'dark';

const TONES: Record<ChipTone, [string, string]> = {
  neutral: ['#F5F5F5', '#525252'],
  danger: ['#FEF2F2', '#991B1B'],
  warn: ['#FFFBEB', '#92400E'],
  info: ['#EEF2FF', '#3730A3'],
  success: ['#F0FDF4', '#166534'],
  dark: ['#171717', '#FFFFFF'],
};

/** A small label that never stretches: single line, hugs its text, truncates only past maxWidth. */
export function Chip({
  label,
  tone = 'neutral',
  icon,
  maxWidth = 140,
}: {
  label: string;
  tone?: ChipTone;
  icon?: keyof typeof Ionicons.glyphMap;
  maxWidth?: number;
}) {
  const [bg, fg] = TONES[tone];
  return (
    <View style={[s.chip, { backgroundColor: bg, maxWidth }]}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text style={[s.text, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 0,
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    height: 22,
  },
  text: { fontFamily: fontFamily.medium, fontSize: 11, flexShrink: 1 },
});

export const hairline = StyleSheet.hairlineWidth;
export const BORDER = COLORS.border;
