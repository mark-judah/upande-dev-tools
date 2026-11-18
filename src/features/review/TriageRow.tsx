import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { Pill, priorityTone } from '@/features/shared/Pill';
import { BAND_TONE, plain, waitingText, type Detail, type QueueRow } from './model';

type Props = {
  item: QueueRow;
  description?: string;
  /** Name of another open request with the same title. */
  duplicateOf?: string;
  selecting: boolean;
  selected: boolean;
  expanded: boolean;
  detail?: Detail | 'loading' | null;
  onPress: () => void;
  onLongPress: () => void;
  onToggle: () => void;
  onMenu: () => void;
};

function when(v: string) {
  try {
    return format(parseISO(v.replace(' ', 'T')), 'd MMM, HH:mm');
  } catch {
    return v;
  }
}

function TriageRowBase({ item, description, duplicateOf, selecting, selected, expanded, detail, onPress, onLongPress, onToggle, onMenu }: Props) {
  const band = BAND_TONE[item.age_band];
  const snippet = plain(description);
  const full = detail && detail !== 'loading' && detail.success ? plain(detail.request?.description) : '';
  const history = detail && detail !== 'loading' && detail.success ? (detail.history ?? []) : [];
  const decided = item.status !== 'Under Review';
  return (
    <View style={[s.card, selected && s.cardSelected]}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.request_type}. ${waitingText(item)}`}
        accessibilityState={{ selected }}
        style={({ pressed }) => [s.body, pressed && { backgroundColor: COLORS.bgMuted }]}
      >
        <View style={s.top}>
          {selecting ? (
            <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={24} color={selected ? COLORS.text : COLORS.textMuted} />
          ) : null}
          <Text style={s.title} numberOfLines={2}>{item.title}</Text>
        </View>

        <View style={s.pills}>
          {item.request_type ? <Pill label={item.request_type} tone="info" /> : null}
          {item.priority ? <Pill label={item.priority} tone={priorityTone(item.priority)} /> : <Pill label="No priority" />}
          {item.product_area ? <Pill label={item.product_area} /> : null}
          {decided ? <Pill label={item.status} /> : null}
        </View>

        <View style={s.ageRow}>
          <View style={[s.age, { backgroundColor: band.bg }]}>
            <Ionicons name="time-outline" size={14} color={band.fg} />
            <Text style={[s.ageText, { color: band.fg }]} numberOfLines={1}>{waitingText(item)}</Text>
          </View>
          <Text style={s.meta} numberOfLines={1}>{item.raised_by_name}</Text>
        </View>

        {snippet && !expanded ? <Text style={s.snippet} numberOfLines={2}>{snippet}</Text> : null}

        {duplicateOf ? (
          <View style={s.dup} accessibilityRole="alert">
            <Ionicons name="copy-outline" size={14} color="#92400E" />
            <Text style={s.dupText} numberOfLines={1}>Same title as {duplicateOf.replace('REQ-', '')}</Text>
          </View>
        ) : null}

        {item.assignees.length || item.due ? (
          <Text style={s.meta} numberOfLines={1}>
            {item.assignees.join(', ')}
            {item.due ? `${item.assignees.length ? ' · ' : ''}due ${item.due}` : ''}
          </Text>
        ) : null}
        {item.tags.length ? (
          <Text style={s.tags} numberOfLines={1}>{item.tags.map((t) => `#${t}`).join('  ')}</Text>
        ) : null}
      </Pressable>

      <Pressable onPress={onMenu} hitSlop={4} style={s.menu} accessibilityRole="button" accessibilityLabel="More actions">
        <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.textMuted} />
      </Pressable>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={expanded ? 'Hide details' : 'Show details and history'}
        style={s.toggle}
      >
        <Text style={s.toggleText}>{expanded ? 'Hide details' : 'Details and history'}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textMuted} />
      </Pressable>

      {expanded ? (
        <View style={s.more}>
          {detail === 'loading' || !detail ? <ActivityIndicator color={COLORS.text} /> : null}
          {detail && detail !== 'loading' && !detail.success ? (
            <Text style={s.err}>{detail.error || 'Could not load the details.'}</Text>
          ) : null}
          {full ? <Text style={s.desc}>{full}</Text> : detail && detail !== 'loading' && detail.success ? <Text style={s.meta}>No description.</Text> : null}
          {history.map((e, i) => (
            <View key={`${e.at}-${i}`} style={s.ev}>
              <Text style={s.evTitle}>{e.title}</Text>
              <Text style={s.evMeta}>{when(e.at)}{e.by_name ? ` · ${e.by_name}` : ''}</Text>
              {e.text ? <Text style={s.evText}>{e.text}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export const TriageRow = memo(TriageRowBase);

/** Spacing and rounded clip live outside the swipeable, so the action panels never peek through. */
export const rowWrap = { marginBottom: spacing.md } as const;

const s = StyleSheet.create({
  card: { backgroundColor: COLORS.surface, borderRadius: borderRadius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border, overflow: 'hidden' },
  cardSelected: { borderWidth: 2, borderColor: COLORS.text },
  body: { padding: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  title: { flex: 1, paddingRight: 32, fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text, lineHeight: 21 },
  menu: { position: 'absolute', top: 2, right: 2, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs + 2 },
  ageRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  age: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: spacing.sm + 2, paddingVertical: 3, flexShrink: 0 },
  ageText: { fontFamily: fontFamily.semiBold, fontSize: 12 },
  meta: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  snippet: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary, lineHeight: 19 },
  dup: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFBEB', borderRadius: borderRadius.sm, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  dupText: { flex: 1, fontFamily: fontFamily.medium, fontSize: 12, color: '#92400E' },
  tags: { fontFamily: fontFamily.regular, fontSize: 12, color: COLORS.textMuted },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, paddingHorizontal: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  toggleText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textSecondary },
  more: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  desc: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.text, lineHeight: 20 },
  err: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.danger },
  ev: { borderLeftWidth: 2, borderLeftColor: COLORS.border, paddingLeft: spacing.md, gap: 2 },
  evTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  evMeta: { fontFamily: fontFamily.regular, fontSize: 12, color: COLORS.textMuted },
  evText: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary },
});
