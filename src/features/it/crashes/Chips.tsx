import { ScrollView, StyleSheet, View } from 'react-native';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { spacing } from '@/core/theme';

export type ChipOption<T extends string> = { value: T; label: string };

/** One horizontally scrolling row of single-choice chips. Chips keep their natural width. */
export function ChipRow<T extends string>({ value, options, onChange }: { value: T; options: ChipOption<T>[]; onChange: (v: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row} style={s.scroll}>
      {options.map((o) => (
        <View key={o.value}>
          <DecisionChip label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 2, alignItems: 'center' },
});
