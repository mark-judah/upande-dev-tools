import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';

type Props = {
  title: string;
  subtitle?: string;
  /** Rendered before the text, e.g. a status circle or icon. Keep it >= 44 px tall if it is tappable. */
  left?: ReactNode;
  /** Rendered after the text, e.g. a pill or a count. */
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Show a chevron when the row opens something. Defaults to true when `onPress` is set. */
  chevron?: boolean;
  /** Draw a hairline under the row (for rows inside one Card). */
  divider?: boolean;
  titleLines?: number;
  accessibilityLabel?: string;
};

/** The one list row: 56 px minimum, pressed state, optional left/right slots. */
export function Row({
  title,
  subtitle,
  left,
  right,
  onPress,
  onLongPress,
  chevron,
  divider,
  titleLines = 2,
  accessibilityLabel,
}: Props) {
  const body = (
    <>
      {left}
      <View style={s.text}>
        <Text style={s.title} numberOfLines={titleLines}>{title}</Text>
        {subtitle ? <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
      {(chevron ?? !!onPress) ? <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} /> : null}
    </>
  );
  const style = [s.row, divider && s.divider];
  if (!onPress && !onLongPress) return <View style={style}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => [style, pressed && { backgroundColor: COLORS.bgMuted }]}
    >
      {body}
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: spacing.sm },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  text: { flex: 1, gap: 2 },
  title: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
  subtitle: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
});
