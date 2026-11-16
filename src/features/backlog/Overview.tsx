import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { GROUPS, isQuickViewActive, QUICK_VIEWS, SCOPES, type Filters, type GroupBy, type Lens, type Scope } from './model';

export type Stat = { key: string; label: string; value: number; hot?: boolean; on: boolean; onPress: () => void };

/** Mine | Team | All, with a count on each so the size of the backlog is always visible. */
export function ScopeSwitch({ scope, counts, onChange }: { scope: Scope; counts: Record<Scope, number>; onChange: (s: Scope) => void }) {
  return (
    <View style={s.scope} accessibilityRole="tablist">
      {SCOPES.map((o) => {
        const on = o.value === scope;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[s.scopeBtn, on && s.scopeOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${o.label} backlog, ${counts[o.value]} open items`}
          >
            <Text style={[s.scopeText, on && s.scopeTextOn]} numberOfLines={1}>{o.label}</Text>
            <Text style={[s.scopeCount, on && { color: COLORS.textSecondary }]} numberOfLines={1}>{counts[o.value]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A compact scope control for the search row: shows the current scope and its count, taps open the picker. */
export function ScopeChip({ scope, counts, onPress }: { scope: Scope; counts: Record<Scope, number>; onPress: () => void }) {
  const label = SCOPES.find((o) => o.value === scope)?.label ?? scope;
  return (
    <Pressable onPress={onPress} style={s.scopeChip} accessibilityRole="button" accessibilityLabel={`Showing ${label}, ${counts[scope]} items. Change scope`}>
      <Text style={s.scopeChipText} numberOfLines={1}>{label}</Text>
      <Text style={s.scopeChipCount} numberOfLines={1}>{counts[scope]}</Text>
      <Ionicons name="chevron-down" size={14} color={COLORS.textMuted} />
    </Pressable>
  );
}

/** Dark tiles that double as filters. */
export function StatsStrip({ stats }: { stats: Stat[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.stripContent} style={s.strip}>
      {stats.map((t) => (
        <Pressable
          key={t.key}
          onPress={t.onPress}
          style={[s.tile, t.hot && s.tileHot, t.on && s.tileOn]}
          accessibilityRole="button"
          accessibilityState={{ selected: t.on }}
          accessibilityLabel={`${t.value} ${t.label}. Tap to filter`}
        >
          <Text style={[s.tileLabel, t.hot && { color: '#FECACA' }]} numberOfLines={1}>{t.label.toUpperCase()}</Text>
          <Text style={[s.tileNum, t.hot && { color: '#FCA5A5' }]} numberOfLines={1}>{t.value.toLocaleString()}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

function PillBtn({ label, count, on, onPress, hint }: { label: string; count?: number; on: boolean; onPress: () => void; hint: string }) {
  return (
    <Pressable onPress={onPress} style={[s.pill, on && s.pillOn]} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={hint}>
      <Text style={[s.pillText, on && s.pillTextOn]} numberOfLines={1}>{label}</Text>
      {count != null ? <Text style={[s.pillCount, on && { color: '#D4D4D4' }]} numberOfLines={1}>{count}</Text> : null}
    </Pressable>
  );
}

/** Saved views: each one sets scope + filters in a single tap. */
export function QuickViews({
  scope,
  lens,
  filters,
  counts,
  onPick,
}: {
  scope: Scope;
  lens: Lens;
  filters: Filters;
  counts: Record<string, number>;
  onPick: (key: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills} style={s.strip}>
      {QUICK_VIEWS.map((q) => (
        <PillBtn
          key={q.key}
          label={q.label}
          count={counts[q.key]}
          on={isQuickViewActive(q, scope, lens, filters)}
          onPress={() => onPick(q.key)}
          hint={`${q.label}, ${counts[q.key] ?? 0} items`}
        />
      ))}
    </ScrollView>
  );
}

export function GroupBar({ value, onChange }: { value: GroupBy; onChange: (g: GroupBy) => void }) {
  return (
    <View style={s.groupRow}>
      <Text style={s.groupLabel}>Group by</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pills} style={{ flex: 1 }}>
        {GROUPS.map((g) => (
          <PillBtn key={g.value} label={g.label} on={g.value === value} onPress={() => onChange(g.value)} hint={`Group by ${g.label}`} />
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  scope: { flexDirection: 'row', backgroundColor: COLORS.bgMuted, borderRadius: 999, padding: 4 },
  scopeBtn: { flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 999 },
  scopeOn: { backgroundColor: COLORS.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  scopeText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textMuted },
  scopeTextOn: { fontFamily: fontFamily.semiBold, color: COLORS.text },
  scopeCount: { fontFamily: fontFamily.regular, fontSize: 11, color: COLORS.textMuted },
  scopeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: spacing.md, borderRadius: 14, backgroundColor: COLORS.bgMuted, flexShrink: 0 },
  scopeChipText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  scopeChipCount: { fontFamily: fontFamily.regular, fontSize: 11, color: COLORS.textMuted },
  strip: { flexGrow: 0 },
  stripContent: { gap: spacing.sm, paddingHorizontal: spacing.lg },
  tile: { width: 96, height: 56, backgroundColor: COLORS.text, borderRadius: 18, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, justifyContent: 'space-between', borderWidth: 2, borderColor: 'transparent' },
  tileHot: { backgroundColor: '#3B0A0A' },
  tileOn: { borderColor: '#86EFAC' },
  tileLabel: { fontFamily: fontFamily.medium, fontSize: 10, letterSpacing: 1, color: '#A3A3A3' },
  tileNum: { fontFamily: fontFamily.bold, fontSize: 22, color: '#fff' },
  pills: { gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: 'center' },
  pill: { alignSelf: 'flex-start', flexShrink: 0, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, borderRadius: 999, backgroundColor: COLORS.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border },
  pillOn: { backgroundColor: COLORS.text, borderColor: COLORS.text },
  pillText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text },
  pillTextOn: { color: '#fff' },
  pillCount: { fontFamily: fontFamily.regular, fontSize: 11, color: COLORS.textMuted },
  groupRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.lg },
  groupLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textMuted },
});
