import { StyleSheet, Text, View } from 'react-native';
import { fontFamily, spacing } from '@/core/theme';

const TONES: Record<string, [string, string]> = {
  success: ['#F0FDF4', '#166534'],
  warn: ['#FFFBEB', '#92400E'],
  danger: ['#FEF2F2', '#991B1B'],
  info: ['#EEF2FF', '#3730A3'],
  neutral: ['#F5F5F5', '#525252'],
};

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: keyof typeof TONES }) {
  const [bg, fg] = TONES[tone];
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <Text style={[s.text, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function priorityTone(p?: string | null): keyof typeof TONES {
  return p === 'Urgent' || p === 'Critical' ? 'danger' : p === 'High' ? 'warn' : 'neutral';
}

const s = StyleSheet.create({
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  text: { fontFamily: fontFamily.medium, fontSize: 12 },
});
