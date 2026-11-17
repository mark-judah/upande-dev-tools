import { memo, useMemo } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import type { Stage } from '@/features/shared/types';
import { ItemRow } from './ItemRow';
import { itemKey, STAGE_ORDER, type Item } from './model';

const ALWAYS: Stage[] = ['Todo', 'In Progress', 'In Review', 'Done'];
const GAP = spacing.md;

type Handlers = {
  projectName: (i: Item) => string | undefined;
  onOpen: (i: Item) => void;
  onMenu: (i: Item) => void;
};

const Column = memo(function Column({ stage, items, width, h }: { stage: Stage; items: Item[]; width: number; h: Handlers }) {
  return (
    <View style={[s.col, { width }]}>
      <View style={s.colHead}>
        <Text style={s.colTitle} numberOfLines={1} accessibilityRole="header">{stage}</Text>
        <View style={s.count}>
          <Text style={s.countText}>{items.length}</Text>
        </View>
      </View>
      <FlatList
        data={items}
        keyExtractor={itemKey}
        renderItem={({ item }) => (
          <ItemRow item={item} variant="card" projectName={h.projectName(item)} onOpen={h.onOpen} onMenu={h.onMenu} />
        )}
        ListEmptyComponent={<Text style={s.empty}>Nothing in {stage}.</Text>}
        contentContainerStyle={{ padding: spacing.sm, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
      />
    </View>
  );
});

export function BoardView({ items, ...h }: { items: Item[] } & Handlers) {
  const { width } = useWindowDimensions();
  const colW = Math.min(Math.round(width * 0.84), 360);
  const columns = useMemo(() => {
    const by: Record<string, Item[]> = {};
    for (const i of items) (by[i.stage] ??= []).push(i);
    return STAGE_ORDER.filter((st) => ALWAYS.includes(st) || (by[st]?.length ?? 0) > 0).map((st) => ({ stage: st, items: by[st] ?? [] }));
  }, [items]);

  return (
    <ScrollView
      horizontal
      snapToInterval={colW + GAP}
      decelerationRate="fast"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ padding: spacing.lg, gap: GAP }}
      style={s.flex}
    >
      {columns.map((c) => (
        <Column key={c.stage} stage={c.stage} items={c.items} width={colW} h={h} />
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  col: {
    backgroundColor: COLORS.bgMuted,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  colHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xs },
  colTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  count: { minWidth: 24, height: 22, borderRadius: 11, paddingHorizontal: 7, backgroundColor: COLORS.text, alignItems: 'center', justifyContent: 'center' },
  countText: { fontFamily: fontFamily.medium, fontSize: 11, color: '#fff' },
  empty: { textAlign: 'center', fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, padding: spacing.xl },
});
