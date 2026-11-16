import { useMemo, type ReactNode } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { Button } from '@/core/ui/Button';
import { ItemRow, RowSkeletons } from './ItemRow';
import type { Stage } from '@/features/shared/types';
import { groupItems, itemKey, type GroupBy, type Item } from './model';

type Section = { key: string; title: string; count: number; data: Item[]; hot?: boolean };

export function ListView({
  items,
  groupBy,
  header,
  selecting,
  selected,
  onSelect,
  onMove,
  bottomPad = 120,
  loading,
  collapsed,
  onToggle,
  projectName,
  onOpen,
  onAdvance,
  onMenu,
  onRefresh,
  refreshing,
  hasFilters,
  onClear,
}: {
  items: Item[];
  groupBy: GroupBy;
  header?: ReactNode;
  selecting: boolean;
  selected: Set<string>;
  onSelect: (i: Item) => void;
  onMove: (i: Item, to: Stage) => void;
  bottomPad?: number;
  loading: boolean;
  collapsed: string[];
  onToggle: (key: string) => void;
  projectName: (i: Item) => string | undefined;
  onOpen: (i: Item) => void;
  onAdvance: (i: Item) => void;
  onMenu: (i: Item) => void;
  onRefresh: () => void;
  refreshing: boolean;
  hasFilters: boolean;
  onClear: () => void;
}) {
  const sections = useMemo<Section[]>(
    () =>
      groupItems(items, groupBy, projectName).map((g) => ({
        key: g.key,
        title: g.title,
        count: g.count,
        hot: g.hot,
        data: collapsed.includes(g.key) ? [] : g.items,
      })),
    [items, groupBy, collapsed, projectName],
  );

  if (loading) return <RowSkeletons />;

  return (
    <SectionList
      sections={sections}
      keyExtractor={itemKey}
      stickySectionHeadersEnabled
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={7}
      onRefresh={onRefresh}
      refreshing={refreshing}
      contentContainerStyle={{ paddingBottom: bottomPad }}
      ListHeaderComponent={header as never}
      extraData={selected}
      renderSectionHeader={({ section }) => {
        const open = !collapsed.includes(section.key);
        return (
          <Pressable
            onPress={() => onToggle(section.key)}
            style={s.head}
            accessibilityRole="button"
            accessibilityLabel={`${section.title}, ${section.count} items, ${open ? 'collapse' : 'expand'}`}
            accessibilityState={{ expanded: open }}
          >
            <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color={COLORS.textMuted} />
            <Text style={[s.headTitle, section.hot && { color: COLORS.danger }]}>{section.title}</Text>
            <View style={s.badge}>
              <Text style={s.badgeText}>{section.count}</Text>
            </View>
          </Pressable>
        );
      }}
      renderItem={({ item }) => (
        <ItemRow
          item={item}
          projectName={projectName(item)}
          onOpen={onOpen}
          onAdvance={onAdvance}
          onMenu={onMenu}
          onMove={onMove}
          selecting={selecting}
          selected={selected.has(itemKey(item))}
          onSelect={onSelect}
        />
      )}
      ListEmptyComponent={
        <View style={s.empty}>
          <Ionicons name={hasFilters ? 'funnel-outline' : 'checkmark-done-outline'} size={40} color={COLORS.textMuted} />
          <Text style={s.emptyTitle}>{hasFilters ? 'No matches' : 'All clear'}</Text>
          <Text style={s.emptyText}>
            {hasFilters ? 'Nothing fits this scope, these filters or that search.' : 'There is no open work in the backlog.'}
          </Text>
          {hasFilters ? <Button label="Clear filters" variant="outline" onPress={onClear} style={{ alignSelf: 'center' }} /> : null}
        </View>
      }
    />
  );
}

const s = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    backgroundColor: COLORS.bgMuted,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  headTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  badge: { minWidth: 22, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: fontFamily.medium, fontSize: 11, color: COLORS.textSecondary },
  empty: { alignItems: 'center', padding: spacing.xxl, gap: spacing.sm },
  emptyTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text },
  emptyText: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, textAlign: 'center', marginBottom: spacing.sm },
});
