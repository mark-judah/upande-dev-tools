import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/core/ui/Button';
import { Card } from '@/core/ui/Card';
import { Skeleton } from '@/core/ui/Skeleton';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { initials } from './format';

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2 }]} accessibilityElementsHidden>
      <Text style={[s.avatarText, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
    </View>
  );
}

/** A label above a value, for the quiet metadata lines in a card. */
export function Field({ label, children, inline }: { label: string; children: ReactNode; inline?: boolean }) {
  return (
    <View style={[s.field, inline && s.fieldInline]}>
      <Text style={[s.fieldLabel, inline && s.fieldLabelInline]}>{label}</Text>
      <View style={[s.fieldValue, inline && s.fieldValueInline]}>{children}</View>
    </View>
  );
}

export const Value = ({ children, onPress }: { children: string; onPress?: () => void }) => (
  <Text selectable={!onPress} onPress={onPress} style={[s.value, onPress && s.valueLink]}>{children}</Text>
);

/** A tappable value chip (due date, project) with an icon; read-only when `onPress` is missing. */
export function ValueChip({ label, icon, tone, onPress, accessibilityLabel }: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: 'late' | 'today' | 'normal';
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const fg = tone === 'late' ? '#991B1B' : tone === 'today' ? '#92400E' : COLORS.text;
  const bg = tone === 'late' ? '#FEF2F2' : tone === 'today' ? '#FFFBEB' : COLORS.bgMuted;
  const body = (
    <>
      {icon ? <Ionicons name={icon} size={16} color={fg} /> : null}
      <Text style={[s.chipText, { color: fg }]} numberOfLines={1}>{label}</Text>
      {onPress ? <Ionicons name="chevron-down" size={14} color={fg} /> : null}
    </>
  );
  if (!onPress) return <View style={[s.valueChip, { backgroundColor: bg }]}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [s.valueChip, { backgroundColor: bg }, pressed && { opacity: 0.8 }]}
    >
      {body}
    </Pressable>
  );
}

export const STEPS = ['Todo', 'In Progress', 'In Review', 'Done'] as const;

/** Four tappable stages with the current one highlighted and the finished ones ticked. */
export function Stepper({ current, onSelect, disabled }: { current: number; onSelect: (i: number) => void; disabled?: boolean }) {
  return (
    <View style={s.stepper} accessibilityRole="tablist">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <Pressable
            key={label}
            onPress={disabled || active ? undefined : () => onSelect(i)}
            accessibilityRole="button"
            accessibilityLabel={`Stage ${label}${active ? ', current' : ''}`}
            accessibilityState={{ selected: active, disabled: !!disabled }}
            style={s.step}
          >
            <View style={s.stepTrack}>
              <View style={[s.line, i === 0 && s.lineHidden, (done || active) && s.lineOn]} />
              <View style={[s.dot, (done || active) && s.dotOn, active && s.dotActive]}>
                {done ? <Ionicons name="checkmark" size={14} color="#fff" /> : <Text style={[s.dotText, active && { color: '#fff' }]}>{i + 1}</Text>}
              </View>
              <View style={[s.line, i === STEPS.length - 1 && s.lineHidden, done && s.lineOn]} />
            </View>
            <Text style={[s.stepLabel, active && s.stepLabelActive]} numberOfLines={1}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A row of chips that wraps instead of squeezing. */
export const ChipRow = ({ children }: { children: ReactNode }) => <View style={s.chipRow}>{children}</View>;

export function DetailSkeleton() {
  return (
    <View accessibilityLabel="Loading" style={{ gap: spacing.md }}>
      <Card>
        <Skeleton width={110} height={12} />
        <Skeleton height={22} style={{ marginTop: spacing.md }} />
        <Skeleton width="70%" height={22} style={{ marginTop: spacing.sm }} />
        <View style={s.skRow}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} width={52} height={52} radius={26} />)}
        </View>
      </Card>
      <Card>
        <Skeleton width={80} height={12} />
        <View style={s.skRow}>
          <Skeleton width={96} height={44} radius={22} />
          <Skeleton width={96} height={44} radius={22} />
        </View>
        <View style={s.skRow}>
          <Skeleton width={64} height={44} radius={22} />
          <Skeleton width={64} height={44} radius={22} />
          <Skeleton width={64} height={44} radius={22} />
        </View>
      </Card>
      <Card>
        <Skeleton width={80} height={12} />
        <Skeleton height={14} style={{ marginTop: spacing.md }} />
        <Skeleton height={14} style={{ marginTop: spacing.sm }} />
        <Skeleton width="60%" height={14} style={{ marginTop: spacing.sm }} />
      </Card>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={s.error}>
      <Ionicons name="cloud-offline-outline" size={36} color={COLORS.textMuted} />
      <Text style={s.errorTitle}>Could not load this</Text>
      <Text style={s.errorMsg}>{message}</Text>
      <Button label="Try again" onPress={onRetry} style={{ alignSelf: 'center', minWidth: 160 }} singleLine />
    </View>
  );
}

const s = StyleSheet.create({
  avatar: { backgroundColor: COLORS.text, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.semiBold, color: '#fff' },
  field: { gap: 4, paddingVertical: spacing.sm },
  fieldInline: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, minHeight: 36 },
  fieldLabelInline: { width: 96, paddingTop: 3 },
  fieldValueInline: { flex: 1 },
  fieldLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldValue: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  value: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
  valueLink: { textDecorationLine: 'underline' },
  valueChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },
  chipText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, flexShrink: 0 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stepper: { flexDirection: 'row', marginTop: spacing.lg },
  step: { flex: 1, alignItems: 'center', minHeight: 64 },
  stepTrack: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', height: 34 },
  line: { flex: 1, height: 2, backgroundColor: COLORS.border },
  lineOn: { backgroundColor: COLORS.text },
  lineHidden: { backgroundColor: 'transparent' },
  dot: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: COLORS.border, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  dotOn: { borderColor: COLORS.text, backgroundColor: COLORS.text },
  dotActive: { width: 34, height: 34, borderRadius: 17, borderWidth: 3, borderColor: COLORS.text },
  dotText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.textMuted },
  stepLabel: { fontFamily: fontFamily.medium, fontSize: 12, color: COLORS.textMuted, marginTop: 6 },
  stepLabelActive: { fontFamily: fontFamily.semiBold, color: COLORS.text },
  skRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  error: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl, marginTop: spacing.xxl },
  errorTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  errorMsg: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, textAlign: 'center', marginBottom: spacing.sm },
});
