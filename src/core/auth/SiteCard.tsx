import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { instanceLabel, siteTitle } from './known-instances';
import { relativeTime, type SiteRow } from './sites';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/core/theme';

/** One saved site as a card: name, who, signed-in dot, last used. */
export function SiteCard({
  site,
  current,
  busy,
  onPress,
  onMenu,
}: {
  site: SiteRow;
  current?: boolean;
  busy?: boolean;
  onPress: () => void;
  onMenu: () => void;
}) {
  const who = site.fullName || site.email;
  const used = relativeTime(site.lastUsedAt);
  return (
    <View style={[s.card, current && s.cardCurrent]}>
      <Pressable
        onPress={onPress}
        onLongPress={onMenu}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={`${siteTitle(site)}, ${site.signedIn ? 'signed in' : 'signed out'}`}
        style={({ pressed }) => [s.main, pressed && { opacity: 0.75 }]}
      >
        <View style={s.icon}>
          <Ionicons name="globe-outline" size={22} color={COLORS.text} />
        </View>
        <View style={s.body}>
          <Text style={s.title} numberOfLines={1}>{siteTitle(site)}</Text>
          {who || site.nickname ? (
            <Text style={s.sub} numberOfLines={1}>
              {[who, site.nickname ? instanceLabel(site.url) : null].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          <View style={s.statusRow}>
            <View style={[s.dot, { backgroundColor: site.signedIn ? COLORS.success : COLORS.textMuted }]} />
            <Text style={s.status} numberOfLines={1}>
              {site.signedIn ? 'Signed in' : 'Sign in'}
              {used ? ` · ${used}` : ''}
            </Text>
          </View>
        </View>
        {busy ? (
          <ActivityIndicator color={COLORS.text} />
        ) : current ? (
          <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />
        ) : null}
      </Pressable>
      <Pressable
        onPress={onMenu}
        accessibilityRole="button"
        accessibilityLabel={`More for ${siteTitle(site)}`}
        style={s.menu}
      >
        <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.textSecondary} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardCurrent: { borderColor: COLORS.primary },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 68,
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.bgMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1 },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary, marginTop: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  status: { flexShrink: 1, fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  menu: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: spacing.xs },
});
