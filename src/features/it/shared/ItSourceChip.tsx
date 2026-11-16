import { useEffect } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/core/auth/store';
import { siteLabel, useItSource } from '@/core/it-source/it-source-store';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';

/** Shows which site the IT data comes from and opens the settings to change it. */
export function ItSourceChip() {
  const hydrate = useItSource((s) => s.hydrate);
  const source = useItSource((s) => s.source);
  const expired = useItSource((s) => s.expired);
  const mainUrl = useAuthStore((s) => s.instanceUrl);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const label = siteLabel(source?.url ?? mainUrl ?? 'this site');
  return (
    <Pressable
      onPress={() => router.push('/it-source' as never)}
      style={[s.chip, expired && s.chipWarn]}
      accessibilityRole="button"
      accessibilityLabel={`IT data comes from ${label}${expired ? ', session expired' : ''}. Change`}
    >
      <Ionicons name={expired ? 'warning-outline' : 'server-outline'} size={14} color={expired ? '#92400E' : COLORS.textSecondary} />
      <Text style={[s.text, expired && { color: '#92400E' }]} numberOfLines={1}>
        {expired ? `Sign in again: ${label}` : `Data from ${label}`}
      </Text>
      <Ionicons name="chevron-forward" size={14} color={COLORS.textMuted} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 36, paddingHorizontal: spacing.md, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, maxWidth: '100%', marginBottom: spacing.md },
  chipWarn: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  text: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textSecondary, flexShrink: 1 },
});
