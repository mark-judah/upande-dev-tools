import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SwipeRow } from '@/core/ui/SwipeRow';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/core/theme';
import { Pill } from '@/features/shared/Pill';
import { ago, KIND_ICON, KIND_LABEL, severity, type Problem } from './model';

type Props = {
  p: Problem;
  maxPeople: number;
  selecting: boolean;
  selected: boolean;
  onOpen: (p: Problem) => void;
  onToggle: (p: Problem) => void;
  onLongPress: (p: Problem) => void;
  onResolve: (p: Problem) => void;
  onIgnore: (p: Problem) => void;
  onReopen: (p: Problem) => void;
};

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statN}>{n}</Text>
      <Text style={s.statL}>{label}</Text>
    </View>
  );
}

function CrashRowBase({ p, maxPeople, selecting, selected, onOpen, onToggle, onLongPress, onResolve, onIgnore, onReopen }: Props) {
  const sev = severity(p);
  const open = p.status === 'Open';
  const versions = p.first_version && p.first_version !== p.version ? `${p.first_version} → ${p.version}` : p.version;
  const impact = maxPeople > 0 ? Math.max(0.06, p.people / maxPeople) : 0.06;
  const label = `${KIND_LABEL[p.kind] ?? p.kind}: ${p.title}. ${p.people} people, ${p.devices} devices, ${p.times} times. Last seen ${ago(p.last_seen)}. ${p.status}.`;

  const card = (
    <Pressable
      onPress={() => (selecting ? onToggle(p) : onOpen(p))}
      onLongPress={() => onLongPress(p)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={({ pressed }) => [s.card, selected && s.cardSel, pressed && { backgroundColor: COLORS.bgMuted }]}
    >
      <View style={s.body}>
        <View style={s.top}>
          {selecting ? (
            <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={22} color={COLORS.text} />
          ) : (
            <View style={[s.kind, { backgroundColor: p.kind === 'crash' ? '#3B0A0A' : '#171717' }]}>
              <Ionicons name={(KIND_ICON[p.kind] ?? 'bug') as keyof typeof Ionicons.glyphMap} size={16} color="#fff" />
            </View>
          )}
          <View style={s.titleBox}>
            <Text style={s.title} numberOfLines={2}>{p.title}</Text>
            {p.culprit ? <Text style={s.culprit} numberOfLines={1}>{p.culprit}</Text> : null}
          </View>
          <Text style={s.ago}>{ago(p.last_seen)}</Text>
        </View>

        <View style={s.stats}>
          <View style={s.stat}>
            <Text style={[s.big, open && p.people >= 5 && { color: COLORS.danger }]}>{p.people}</Text>
            <Text style={s.statL}>{p.people === 1 ? 'person hit' : 'people hit'}</Text>
          </View>
          <Stat n={p.devices} label="devices" />
          <Stat n={p.times} label="times" />
        </View>

        <View style={s.bar}>
          <View style={[s.barFill, { width: `${Math.round(impact * 100)}%`, backgroundColor: sev.color }]} />
        </View>

        <View style={s.meta}>
          <Text style={s.app} numberOfLines={1}>{p.app}</Text>
          {versions ? <Text style={s.ver} numberOfLines={1}>v{versions}</Text> : null}
          {p.status === 'Resolved' ? <Pill label={p.fixed_in ? `Fixed in ${p.fixed_in}` : 'Resolved'} tone="success" /> : null}
          {p.status === 'Ignored' ? <Pill label="Ignored" /> : null}
        </View>
      </View>
    </Pressable>
  );

  return (
    <SwipeRow
      radius={borderRadius.md}
      disabled={selecting}
      swipeRight={open ? { label: 'Resolve', icon: 'checkmark-circle', color: '#16A34A', onTrigger: () => onResolve(p) } : { label: 'Reopen', icon: 'refresh', color: COLORS.text, onTrigger: () => onReopen(p) }}
      swipeLeft={open ? { label: 'Ignore', icon: 'eye-off', color: '#737373', onTrigger: () => onIgnore(p) } : undefined}
    >
      {card}
    </SwipeRow>
  );
}

export const CrashRow = memo(CrashRowBase);

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  cardSel: { borderColor: COLORS.text, borderWidth: 2 },
  body: { flex: 1, padding: spacing.md, gap: spacing.sm },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  kind: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  titleBox: { flex: 1 },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text, lineHeight: 20 },
  culprit: { fontFamily: 'monospace', fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  ago: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: 3 },
  stats: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xl },
  stat: { alignItems: 'flex-start' },
  big: { fontFamily: fontFamily.bold, fontSize: fontSize.xxl, color: COLORS.text, lineHeight: 32 },
  statN: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: COLORS.text, lineHeight: 24 },
  statL: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  bar: { height: 4, borderRadius: 2, backgroundColor: COLORS.bgMuted, overflow: 'hidden' },
  barFill: { height: 4, borderRadius: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  app: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textSecondary, flexShrink: 1 },
  ver: { fontFamily: 'monospace', fontSize: 11, color: COLORS.textMuted, flexShrink: 1 },
});
