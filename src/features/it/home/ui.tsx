import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { DecisionChip } from '@/core/ui/DecisionChip';

export const go = (path: string) => router.push(path as never);

export const TONE = {
  ink: { bg: '#171717', fg: '#FFFFFF', sub: '#A3A3A3', accent: '#FFFFFF' },
  good: { bg: '#052E16', fg: '#FFFFFF', sub: '#86EFAC', accent: '#4ADE80' },
  alarm: { bg: '#3B0A0A', fg: '#FFFFFF', sub: '#FCA5A5', accent: '#F87171' },
};
export type ToneKey = keyof typeof TONE;

/** A dial made of ticks: filled ticks show the share. Pure Views, no chart library. */
export function Ring({ pct, size = 120, ticks = 40, on = '#4ADE80', off = 'rgba(255,255,255,0.14)', children }: { pct: number | null; size?: number; ticks?: number; on?: string; off?: string; children?: ReactNode }) {
  const grow = useState(() => new Animated.Value(0))[0];
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = grow.addListener(({ value }) => setShown(Math.round(value)));
    Animated.timing(grow, { toValue: Math.round(((pct ?? 0) / 100) * ticks), duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    return () => grow.removeListener(id);
  }, [pct, ticks, grow]);
  const r = size / 2;
  const h = Math.max(6, size * 0.11);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: ticks }, (_, i) => {
        const a = (i / ticks) * 360;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              width: 3,
              height: h,
              borderRadius: 2,
              left: r - 1.5,
              top: 0,
              backgroundColor: i < shown ? on : off,
              transform: [{ translateY: r - h / 2 }, { rotate: `${a}deg` }, { translateY: -(r - h / 2) }],
            }}
          />
        );
      })}
      {children}
    </View>
  );
}

/** Stacked daily bars: one column per day, `danger` part drawn in red. */
export function Spark({ days, height = 64 }: { days: { label: string; total: number; danger: number }[]; height?: number }) {
  const max = Math.max(1, ...days.map((d) => d.total));
  return (
    <View style={[st.spark, { height }]} accessible accessibilityLabel={`Events per day, last ${days.length} days. Busiest day ${max}.`}>
      {days.map((d, i) => {
        const full = d.total > 0 ? Math.max(3, (d.total / max) * height) : 2;
        const red = d.total > 0 ? (d.danger / d.total) * full : 0;
        return (
          <View key={i} style={st.sparkCol}>
            <View style={{ height: full, width: '100%', borderRadius: 2, overflow: 'hidden', backgroundColor: d.total ? '#A3A3A3' : '#D4D4D4' }}>
              <View style={{ position: 'absolute', bottom: 0, height: red, width: '100%', backgroundColor: COLORS.danger }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** Horizontal bar with a label and a value on the right. */
export function Bar({ label, value, max, color = COLORS.text, note, onDark }: { label: string; value: number; max: number; color?: string; note?: string; onDark?: boolean }) {
  const pct = max > 0 ? Math.max(value > 0 ? 3 : 0, (value / max) * 100) : 0;
  return (
    <View style={st.barRow} accessible accessibilityLabel={`${label}: ${value}${note ? ', ' + note : ''}`}>
      <Text style={[st.barLabel, onDark && { color: '#D4D4D4' }]} numberOfLines={1}>{label}</Text>
      <View style={[st.barTrack, onDark && { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
        <View style={{ width: `${pct}%`, height: '100%', borderRadius: 5, backgroundColor: color }} />
      </View>
      <Text style={[st.barVal, onDark && { color: '#fff' }]}>{value}</Text>
    </View>
  );
}

/** A dark tile with one big number. */
export function Tile({ label, value, sub, tone, onPress, icon }: { label: string; value: string | number; sub?: string; tone: ToneKey; onPress?: () => void; icon: keyof typeof Ionicons.glyphMap }) {
  const t = TONE[tone];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}${sub ? '. ' + sub : ''}`}
      style={({ pressed }) => [st.tile, { backgroundColor: t.bg, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={st.tileTop}>
        <Ionicons name={icon} size={16} color={t.accent} />
        <Text style={[st.tileLabel, { color: t.sub }]} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[st.tileValue, { color: t.fg }]} numberOfLines={1}>{value}</Text>
      <Text style={[st.tileSub, { color: t.sub }]} numberOfLines={1}>{sub ?? ' '}</Text>
    </Pressable>
  );
}

/** Single-row chips that scroll sideways and never stretch. */
export function ChipRow({ items, value, onChange }: { items: { key: string; label: string }[]; value: string; onChange: (k: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips} style={st.chipScroll}>
      {items.map((i) => (
        <DecisionChip key={i.key} label={i.label} selected={value === i.key} onPress={() => onChange(i.key)} />
      ))}
    </ScrollView>
  );
}

export function SectionTitle({ children, right }: { children: string; right?: ReactNode }) {
  return (
    <View style={st.sectionRow}>
      <Text style={st.section}>{children}</Text>
      {right}
    </View>
  );
}

export function Note({ children }: { children: string }) {
  return <Text style={st.note}>{children}</Text>;
}

export function fmtDate(v?: string | null): string {
  if (!v) return '';
  const d = new Date(v.replace(' ', 'T'));
  if (isNaN(d.getTime())) return v.slice(0, 10);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function daysLabel(n: number | null | undefined): string {
  if (n == null) return 'never released';
  if (n === 0) return 'released today';
  return `released ${n}d ago`;
}

const st = StyleSheet.create({
  spark: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  sparkCol: { flex: 1, justifyContent: 'flex-end' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 28 },
  barLabel: { width: 96, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textSecondary },
  barTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: COLORS.bgMuted, overflow: 'hidden' },
  barVal: { width: 36, textAlign: 'right', fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  tile: { flexGrow: 1, flexBasis: '47%', borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, minHeight: 84, justifyContent: 'space-between' },
  tileTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 1 },
  tileValue: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, lineHeight: 28, marginTop: spacing.xs },
  tileSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs },
  chipScroll: { flexGrow: 0, marginBottom: spacing.md },
  chips: { gap: spacing.sm, paddingRight: spacing.lg },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md, marginBottom: spacing.sm },
  section: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text, textTransform: 'uppercase', letterSpacing: 0.4 },
  note: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, lineHeight: 16, marginTop: spacing.sm },
});
