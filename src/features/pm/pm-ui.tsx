import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/core/ui/Screen';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { Skeleton } from '@/core/ui/Skeleton';
import { Button } from '@/core/ui/Button';
import { useAuthStore } from '@/core/auth/store';
import { PM } from '@/navigation';
import { Avatar } from '@/features/detail/parts';
import { Pill } from '@/features/shared/Pill';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { HEALTH_LABEL, type HealthKind } from './pm-api';

export const DARK = '#171717';
export const GREEN = '#052E16';
export const ALARM = '#3B0A0A';
export const GREY = '#A3A3A3';

/** Only Projects Managers and System Managers see PM screens (the server enforces it too). */
export function PMGate({ title, children }: { title: string; children: ReactNode }) {
  const hasRole = useAuthStore((st) => st.hasRole);
  if (PM.some((r) => hasRole(r))) return <>{children}</>;
  return (
    <Screen title={title}>
      <View style={s.gate}>
        <Ionicons name="lock-closed-outline" size={32} color={COLORS.textMuted} />
        <Text style={s.gateTitle}>For project managers</Text>
        <Text style={s.gateBody}>
          This view needs the Projects Manager role. Ask an administrator if you should have it.
        </Text>
        <Button label="Go back" variant="outline" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </View>
    </Screen>
  );
}
export function SectionTitle({ children, action }: { children: string; action?: { label: string; onPress: () => void } }) {
  return (
    <View style={s.sectionHead}>
      <Text style={s.sectionTitle} accessibilityRole="header">{children}</Text>
      {action ? (
        <Pressable onPress={action.onPress} hitSlop={8} style={s.sectionAction} accessibilityRole="button">
          <Text style={s.sectionActionText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A short plain-language explanation under a number, like the web console's notes. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <View style={s.note}>
      <Ionicons name="information-circle-outline" size={15} color={COLORS.textMuted} style={{ marginTop: 1 }} />
      <Text style={s.noteText}>{children}</Text>
    </View>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyTitle}>{title}</Text>
      {body ? <Text style={s.emptyBody}>{body}</Text> : null}
    </View>
  );
}

export function PageSkeleton() {
  return (
    <View style={{ gap: spacing.md }} accessibilityLabel="Loading">
      <Skeleton height={120} radius={24} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Skeleton height={96} radius={16} style={{ flex: 1 }} />
        <Skeleton height={96} radius={16} style={{ flex: 1 }} />
      </View>
      <Skeleton height={180} radius={14} />
      <Skeleton height={140} radius={14} />
    </View>
  );
}

type Tone = 'dark' | 'green' | 'alarm';
const TONE_BG: Record<Tone, string> = { dark: DARK, green: GREEN, alarm: ALARM };

/** A dark number tile. Tapping it opens the list behind the number. */
export function Tile({ label, value, sub, tone = 'dark', onPress, subColor }: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: Tone;
  onPress?: () => void;
  subColor?: string;
}) {
  const body = (
    <>
      <Text style={s.tileLabel} numberOfLines={1}>{label.toUpperCase()}</Text>
      <Text style={s.tileNum} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={[s.tileSub, subColor ? { color: subColor } : null]} numberOfLines={2}>{sub}</Text> : null}
    </>
  );
  const style = [s.tile, { backgroundColor: TONE_BG[tone] }];
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. Open the list`}
      style={({ pressed }) => [style, pressed && { opacity: 0.85 }]}
    >
      {body}
    </Pressable>
  );
}
export const TileGrid = ({ children }: { children: ReactNode }) => <View style={s.grid}>{children}</View>;

export type Segment = { key: string; label: string; value: number; color: string };

/** One stacked bar with a tappable legend underneath. */
export function StackBar({ segments, onPress }: { segments: Segment[]; onPress?: (key: string) => void }) {
  const total = segments.reduce((a, x) => a + x.value, 0);
  return (
    <View style={{ gap: spacing.md }}>
      <View style={s.stack}>
        {total === 0 ? <View style={{ flex: 1, backgroundColor: COLORS.border }} /> : null}
        {segments.filter((x) => x.value > 0).map((x) => (
          <Pressable
            key={x.key}
            onPress={onPress ? () => onPress(x.key) : undefined}
            accessibilityRole="button"
            accessibilityLabel={`${x.label}: ${x.value}`}
            style={{ flex: x.value, backgroundColor: x.color }}
          />
        ))}
      </View>
      <View style={s.legend}>
        {segments.map((x) => (
          <Pressable
            key={x.key}
            onPress={onPress ? () => onPress(x.key) : undefined}
            style={s.legendItem}
            accessibilityRole="button"
            accessibilityLabel={`${x.label}: ${x.value}`}
          >
            <View style={[s.dot, { backgroundColor: x.color }]} />
            <Text style={s.legendText}>{x.label}</Text>
            <Text style={s.legendNum}>{x.value}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export type BarPoint = { label: string; a: number; b?: number };

/** Weekly columns. `a` is the pale bar, `b` the dark one; tap a column to read it. */
export function BarChart({ data, selected, onSelect, height = 120, aColor = GREY, bColor = DARK }: {
  data: BarPoint[];
  selected?: number | null;
  onSelect?: (i: number) => void;
  height?: number;
  aColor?: string;
  bColor?: string;
}) {
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b ?? 0]));
  const step = data.length > 8 ? 3 : 1;
  return (
    <View>
      <View style={[s.chart, { height }]}>
        {data.map((d, i) => {
          const on = selected === i;
          return (
            <Pressable
              key={`${d.label}-${i}`}
              onPress={onSelect ? () => onSelect(i) : undefined}
              accessibilityRole="button"
              accessibilityLabel={`${d.label}: ${d.a}${d.b != null ? ` and ${d.b}` : ''}`}
              style={[s.col, on && { backgroundColor: COLORS.bgMuted }]}
            >
              <View style={s.pair}>
                <View style={[s.bar, { height: Math.max(d.a ? 3 : 0, (d.a / max) * (height - 8)), backgroundColor: aColor }]} />
                {d.b != null ? (
                  <View style={[s.bar, { height: Math.max(d.b ? 3 : 0, (d.b / max) * (height - 8)), backgroundColor: bColor }]} />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={s.axis}>
        {data.map((d, i) => (
          <Text key={`${d.label}-${i}`} style={s.axisText} numberOfLines={1}>{i % step === 0 ? d.label : ''}</Text>
        ))}
      </View>
    </View>
  );
}

export type HBarRow = { key: string; label: string; value: number; sub?: string; color?: string; unit?: string };

/** Horizontal bars, one tappable row each (ageing, areas). */
export function HBars({ rows, onPress, max }: { rows: HBarRow[]; onPress?: (key: string) => void; max?: number }) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <View>
      {rows.map((r) => (
        <Pressable
          key={r.key}
          onPress={onPress && r.value > 0 ? () => onPress(r.key) : undefined}
          accessibilityRole={onPress ? 'button' : undefined}
          accessibilityLabel={`${r.label}: ${r.value}`}
          style={s.hrow}
        >
          <View style={s.hrowHead}>
            <Text style={s.hrowLabel} numberOfLines={1}>{r.label}</Text>
            <Text style={s.hrowValue}>
              {r.value}{r.unit ?? ''}
              {r.sub ? <Text style={s.hrowSub}>{`  ${r.sub}`}</Text> : null}
            </Text>
          </View>
          <View style={s.hbarTrack}>
            <View style={[s.hbarFill, { width: `${(r.value / top) * 100}%`, backgroundColor: r.color ?? DARK }]} />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

export function HealthPill({ kind }: { kind: HealthKind }) {
  return <Pill label={HEALTH_LABEL[kind]} tone={kind === 'good' ? 'success' : kind === 'risk' ? 'warn' : 'danger'} />;
}

/** Overlapping avatars, capped, with a +N. */
export function Avatars({ names, size = 26, max = 4 }: { names: string[]; size?: number; max?: number }) {
  if (!names.length) return <Text style={s.noOne}>Nobody yet</Text>;
  const shown = names.slice(0, max);
  const more = names.length - shown.length;
  return (
    <View style={s.avatars} accessibilityLabel={`Team: ${names.join(', ')}`}>
      {shown.map((n, i) => (
        <View key={n + i} style={[s.avatarWrap, { marginLeft: i ? -size * 0.3 : 0, borderRadius: size }]}>
          <Avatar name={n} size={size} />
        </View>
      ))}
      {more > 0 ? <Text style={s.more}>+{more}</Text> : null}
    </View>
  );
}

/** A horizontally scrolling row of chips that never squeezes. */
export function ChipScroll<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={s.chips}
      style={s.chipScroll}
    >
      {options.map((o) => (
        <DecisionChip key={o.value} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </ScrollView>
  );
}

export function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.kv}>
      <Text style={s.kvLabel}>{label}</Text>
      <Text style={s.kvValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

export const fmtDelta = (v: number | null, unit: string) =>
  v ? `${v > 0 ? '+' : '-'}${Math.abs(v)}${unit} vs the period before` : '';

const s = StyleSheet.create({
  gate: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl },
  gateTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text },
  gateBody: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.textMuted, textAlign: 'center' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, marginBottom: spacing.sm, minHeight: 32 },
  sectionTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text, textTransform: 'uppercase', letterSpacing: 0.4 },
  sectionAction: { minHeight: 44, justifyContent: 'center' },
  sectionActionText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text, textDecorationLine: 'underline' },
  note: { flexDirection: 'row', gap: spacing.xs + 2, marginTop: spacing.sm },
  noteText: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.xs + 1, lineHeight: 17, color: COLORS.textMuted },
  empty: { paddingVertical: spacing.lg, alignItems: 'center', gap: 4 },
  emptyTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  emptyBody: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.sm, marginBottom: spacing.md },
  tile: { borderRadius: borderRadius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, width: '48.5%', minHeight: 72 },
  tileLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, letterSpacing: 0.4, color: GREY },
  tileNum: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, lineHeight: 28, color: '#FFFFFF', marginTop: 2 },
  tileSub: { fontFamily: fontFamily.regular, fontSize: 11, lineHeight: 15, color: GREY },
  stack: { flexDirection: 'row', height: 18, borderRadius: 9, overflow: 'hidden', gap: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingRight: spacing.md, flexBasis: '46%', flexGrow: 1 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary },
  legendNum: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  col: { flex: 1, height: '100%', justifyContent: 'flex-end', borderRadius: 4 },
  pair: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 1 },
  bar: { flex: 1, maxWidth: 10, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  axis: { flexDirection: 'row', gap: 2, marginTop: 4 },
  axisText: { flex: 1, fontFamily: fontFamily.regular, fontSize: 9, color: COLORS.textMuted, textAlign: 'center', overflow: 'visible' },
  hrow: { minHeight: 48, justifyContent: 'center', paddingVertical: 6, gap: 6 },
  hrowHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.sm },
  hrowLabel: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text },
  hrowValue: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  hrowSub: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  hbarTrack: { height: 8, borderRadius: 4, backgroundColor: COLORS.border, overflow: 'hidden' },
  hbarFill: { height: 8, borderRadius: 4 },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  avatarWrap: { borderWidth: 2, borderColor: COLORS.surface, overflow: 'hidden' },
  more: { marginLeft: 6, fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted },
  noOne: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  chipScroll: { flexGrow: 0, marginHorizontal: -spacing.lg, marginBottom: spacing.sm },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: 'center' },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 6 },
  kvLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  kvValue: { flex: 1, textAlign: 'right', fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text },
});
