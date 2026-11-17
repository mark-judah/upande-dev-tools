import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { relativeTime } from '@/core/auth/sites';
import { hostLabel, instanceTitle, type ItInstance } from '@/core/it-source/instances-model';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/core/theme';

/** One saved IT instance: name, account, status and when it was last used. Same shape as the main site cards. */
export function InstanceRow({
  instance,
  active,
  busy,
  onPress,
  onMenu,
}: {
  instance: ItInstance;
  active?: boolean;
  busy?: boolean;
  onPress: () => void;
  onMenu?: () => void;
}) {
  const expired = instance.status === 'expired';
  const who = instance.fullName || instance.email;
  const used = relativeTime(instance.lastUsedAt);
  return (
    <View style={[s.card, active && s.cardActive]}>
      <Pressable
        onPress={onPress}
        onLongPress={onMenu}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ selected: !!active }}
        accessibilityLabel={`${instanceTitle(instance)}, ${expired ? 'session expired' : 'connected'}${active ? ', active' : ''}`}
        style={({ pressed }) => [s.main, pressed && { opacity: 0.75 }]}
      >
        <View style={s.icon}>
          <Ionicons name="server-outline" size={20} color={COLORS.text} />
        </View>
        <View style={s.body}>
          <Text style={s.title} numberOfLines={1}>{instanceTitle(instance)}</Text>
          <Text style={s.sub} numberOfLines={1}>
            {[who, instance.nickname ? hostLabel(instance.url) : null].filter(Boolean).join(' · ')}
          </Text>
          <View style={s.statusRow}>
            <View style={[s.dot, { backgroundColor: expired ? COLORS.warn : COLORS.success }]} />
            <Text style={s.status} numberOfLines={1}>
              {expired ? 'Session expired, sign in again' : 'Connected'}
              {used ? ` · ${used}` : ''}
            </Text>
          </View>
        </View>
        {busy ? <ActivityIndicator color={COLORS.text} /> : active ? <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} /> : null}
      </Pressable>
      {onMenu ? (
        <Pressable onPress={onMenu} accessibilityRole="button" accessibilityLabel={`More for ${instanceTitle(instance)}`} style={s.menu}>
          <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: COLORS.border },
  cardActive: { borderColor: COLORS.primary },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64, paddingVertical: spacing.sm, paddingLeft: spacing.md },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.bgMuted, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary, marginTop: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  status: { flexShrink: 1, fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  menu: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: spacing.xs },
});
