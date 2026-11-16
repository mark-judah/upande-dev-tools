import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '@/core/ui/Dialog';
import { Button } from '@/core/ui/Button';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';

export type RemindResult = { sent: number; rows: { user: string; app: string; name: string; result: string }[] };

const META: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  sent: { label: 'Reminded', icon: 'checkmark-circle', color: '#16A34A' },
  recent: { label: 'Reminded recently, skipped', icon: 'time', color: COLORS.warn },
  no_device: { label: 'No device to notify', icon: 'phone-portrait-outline', color: COLORS.danger },
  not_behind: { label: 'No longer behind', icon: 'checkmark-done', color: COLORS.textMuted },
};

export function ResultSheet({ result, onClose }: { result: RemindResult | null; onClose: () => void }) {
  const counts: Record<string, number> = {};
  result?.rows.forEach((r) => { counts[r.result] = (counts[r.result] ?? 0) + 1; });
  return (
    <BottomSheet visible={!!result} onClose={onClose} title={result ? `${result.sent} of ${result.rows.length} reminded` : ''}>
      <View style={s.sum}>
        {Object.entries(counts).map(([k, n]) => (
          <Text key={k} style={s.sumT}>{n} {(META[k]?.label ?? k).toLowerCase()}</Text>
        ))}
      </View>
      {result?.rows.map((r) => {
        const m = META[r.result] ?? META.not_behind;
        return (
          <View key={`${r.user}|${r.app}`} style={s.row} accessible accessibilityLabel={`${r.name}: ${m.label}`}>
            <Ionicons name={m.icon} size={22} color={m.color} />
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={1}>{r.name}</Text>
              <Text style={s.sub}>{m.label}</Text>
            </View>
          </View>
        );
      })}
      <View style={{ marginTop: spacing.md }}><Button label="Done" onPress={onClose} /></View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  sum: { gap: 2, marginBottom: spacing.sm },
  sumT: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  name: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
});
