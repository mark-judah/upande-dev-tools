import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { relativeDue } from '@/core/date';
import { Skeleton } from '@/core/ui/Skeleton';
import { SwipeRow, type SwipeAction } from '@/core/ui/SwipeRow';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { Chip, type ChipTone } from './Chip';
import { initials, priorityColor, selectable, swipeTargets, type Item } from './model';
import type { Stage } from '@/features/shared/types';

const KIND_ICON = {
  Task: 'checkbox-outline',
  Issue: 'bug-outline',
  Request: 'chatbubble-ellipses-outline',
} as const;

const STAGE_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  Todo: 'ellipse-outline',
  'In Progress': 'play-circle-outline',
  'In Review': 'eye-outline',
  Done: 'checkmark-circle',
  Blocked: 'pause-circle-outline',
  Triage: 'help-circle-outline',
};

const STAGE_TONE: Record<string, ChipTone> = {
  'In Progress': 'info',
  'In Review': 'warn',
  Done: 'success',
  Blocked: 'danger',
  Triage: 'neutral',
  Todo: 'neutral',
};

const DUE_TONE = { late: 'danger', today: 'warn', soon: 'info', later: 'neutral', none: 'neutral' } as const;

export function Avatars({ names, max = 3 }: { names: string[]; max?: number }) {
  if (!names.length) return null;
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <View style={s.avatars} accessibilityLabel={`Assigned to ${names.join(', ')}`}>
      {shown.map((n, idx) => (
        <View key={`${n}-${idx}`} style={[s.avatar, idx > 0 && { marginLeft: -8 }]}>
          <Text style={s.avatarText}>{initials(n)}</Text>
        </View>
      ))}
      {extra > 0 ? (
        <View style={[s.avatar, s.avatarMore, { marginLeft: -8 }]}>
          <Text style={[s.avatarText, { color: COLORS.textSecondary }]}>+{extra}</Text>
        </View>
      ) : null}
    </View>
  );
}

type Props = {
  item: Item;
  projectName?: string;
  /** 'row' is the dense list row; 'card' sits inside a board column. */
  variant?: 'row' | 'card';
  onOpen: (i: Item) => void;
  onAdvance?: (i: Item) => void;
  onMenu?: (i: Item) => void;
  /** Swipe right = Done, swipe left = In progress (or back). Omit to turn swiping off. */
  onMove?: (i: Item, to: Stage) => void;
  /** Select mode: the circle becomes a checkbox, taps toggle, swiping is off. */
  selecting?: boolean;
  selected?: boolean;
  onSelect?: (i: Item) => void;
};

function ItemRowImpl({ item, projectName, variant = 'row', onOpen, onAdvance, onMenu, onMove, selecting, selected, onSelect }: Props) {
  const due = item.end && item.stage !== 'Done' ? relativeDue(item.end) : null;
  const isTask = item.doctype === 'Task';
  const card = variant === 'card';
  const tags = item.tags ?? [];
  const names = item.assignees?.length ? item.assignees : item.assignee_ids ?? [];
  const canAdvance = isTask && item.stage !== 'Done' && !!onAdvance;

  const label = `${item.doctype} ${item.title}. ${item.stage}${due ? `, due ${due.label}` : ''}`;

  const content = (
    <>
      <Text style={[s.title, item.stage === 'Done' && s.titleDone, card && { paddingRight: 40 }]} numberOfLines={2}>
        {item.title}
      </Text>
      <View style={s.meta}>
        {card || isTask ? <Ionicons name={KIND_ICON[item.doctype]} size={14} color={COLORS.textMuted} /> : null}
        {due ? <Chip label={due.label} tone={DUE_TONE[due.tone]} icon="calendar-outline" /> : null}
        {!card ? <Chip label={item.stage} tone={STAGE_TONE[item.stage] ?? 'neutral'} /> : null}
        {item.project ? <Chip label={projectName || item.project} icon="folder-outline" maxWidth={118} /> : null}
        {item.module ? <Chip label={item.module} icon="cube-outline" maxWidth={108} /> : null}
        {tags.slice(0, 1).map((t) => (
          <Chip key={t} label={t} icon="pricetag-outline" maxWidth={110} />
        ))}
        {tags.length > 1 ? <Chip label={`+${tags.length - 1}`} /> : null}
      </View>
    </>
  );

  if (card) {
    return (
      <View style={[s.wrap, s.card]}>
        <View style={[s.bar, { backgroundColor: priorityColor(item.priority) }]} />
        <Pressable
          onPress={() => onOpen(item)}
          onLongPress={onMenu ? () => onMenu(item) : undefined}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={({ pressed }) => [s.cardMain, pressed && s.pressed]}
        >
          {content}
          {names.length ? (
            <View style={s.cardFoot}>
              <Avatars names={names} />
            </View>
          ) : null}
        </Pressable>
        {onMenu ? (
          <Pressable
            onPress={() => onMenu(item)}
            style={s.menuBtn}
            accessibilityRole="button"
            accessibilityLabel={`Move ${item.title}`}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.textSecondary} />
          </Pressable>
        ) : null}
      </View>
    );
  }

  const canSelect = !!onSelect && selectable(item);
  const targets = onMove && !selecting ? swipeTargets(item) : {};
  const toAction = (t?: ReturnType<typeof swipeTargets>['right']): SwipeAction | undefined =>
    t ? { label: t.label, icon: t.icon, color: t.color, onTrigger: () => onMove?.(item, t.to) } : undefined;
  const press = selecting && canSelect ? () => onSelect?.(item) : () => onOpen(item);
  const longPress = canSelect && !selecting ? () => onSelect?.(item) : onMenu && !selecting ? () => onMenu(item) : undefined;

  return (
    <SwipeRow swipeRight={toAction(targets.right)} swipeLeft={toAction(targets.left)} disabled={selecting || !onMove}>
      <View style={[s.wrap, selected && s.selected]}>
        <View style={[s.bar, { backgroundColor: priorityColor(item.priority) }]} />
        <View style={s.body}>
          {selecting ? (
            <View
              style={s.circle}
              accessible
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !!selected, disabled: !canSelect }}
              accessibilityLabel={item.title}
            >
              {canSelect ? (
                <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={26} color={selected ? COLORS.text : COLORS.textMuted} />
              ) : null}
            </View>
          ) : isTask ? (
            <Pressable
              onPress={canAdvance ? () => onAdvance?.(item) : undefined}
              disabled={!canAdvance}
              style={s.circle}
              accessibilityRole="button"
              accessibilityLabel={canAdvance ? `Advance ${item.title} from ${item.stage}` : `${item.title} is ${item.stage}`}
            >
              <Ionicons
                name={STAGE_ICON[item.stage] ?? 'ellipse-outline'}
                size={30}
                color={item.stage === 'Done' ? COLORS.success : COLORS.text}
              />
            </Pressable>
          ) : (
            <View style={s.circle}>
              <Ionicons name={KIND_ICON[item.doctype]} size={22} color={COLORS.textMuted} />
            </View>
          )}
          <Pressable
            onPress={press}
            onLongPress={longPress}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={({ pressed }) => [s.mainPress, pressed && s.pressed]}
          >
            <View style={s.main}>{content}</View>
            {names.length ? <Avatars names={names} /> : null}
          </Pressable>
        </View>
      </View>
    </SwipeRow>
  );
}

export const ItemRow = memo(ItemRowImpl);

/** Placeholder rows shaped like ItemRow, so the layout does not jump when data lands. */
export function RowSkeletons({ count = 7 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }).map((_, k) => (
        <View key={k} style={[s.wrap, { opacity: 1 - k * 0.1 }]}>
          <View style={[s.bar, { backgroundColor: COLORS.border }]} />
          <View style={s.body}>
            <Skeleton width={36} height={36} radius={18} style={{ marginRight: spacing.md }} />
            <View style={s.main}>
              <Skeleton width={k % 2 ? '70%' : '90%'} height={14} />
              <View style={[s.meta, { marginTop: spacing.sm }]}>
                <Skeleton width={64} height={20} radius={10} />
                <Skeleton width={72} height={20} radius={10} />
                <Skeleton width={90} height={20} radius={10} />
              </View>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    minHeight: 72,
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    marginBottom: spacing.sm,
    minHeight: 0,
  },
  pressed: { backgroundColor: COLORS.bgMuted },
  selected: { backgroundColor: '#EEF2FF' },
  bar: { width: 4, alignSelf: 'stretch', position: 'absolute', left: 0, top: 0, bottom: 0 },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.md + 4 },
  mainPress: { flex: 1, flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', paddingRight: spacing.md },
  cardMain: { flex: 1, paddingVertical: spacing.sm, paddingLeft: spacing.md + 4, paddingRight: spacing.md },
  circle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm, marginLeft: -spacing.xs },
  main: { flex: 1, minWidth: 0, paddingVertical: spacing.sm },
  title: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text, lineHeight: 20 },
  titleDone: { color: COLORS.textMuted, textDecorationLine: 'line-through' },
  menuBtn: { position: 'absolute', top: 0, right: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 6 },
  cardFoot: { marginTop: spacing.sm, alignItems: 'flex-start' },
  avatars: { flexDirection: 'row', alignItems: 'center', marginLeft: spacing.sm },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.text,
    borderWidth: 2,
    borderColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarMore: { backgroundColor: COLORS.bgMuted },
  avatarText: { fontFamily: fontFamily.medium, fontSize: 10, color: '#fff' },
});
