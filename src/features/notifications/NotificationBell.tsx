import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, fontFamily } from '@/core/theme';
import { useInbox } from './inbox-store';

/** The header bell: opens the inbox, with the unread count on it. Shown on every tab screen's header. */
export function NotificationBell() {
  const unread = useInbox((s) => s.unread);
  const label = unread > 99 ? '99+' : String(unread);
  return (
    <Pressable
      onPress={() => router.push('/notifications' as never)}
      hitSlop={6}
      style={({ pressed }) => [s.btn, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
    >
      <Ionicons name={unread ? 'notifications' : 'notifications-outline'} size={24} color={COLORS.text} />
      {unread ? (
        <View style={[s.badge, label.length > 1 && s.badgeWide]}>
          <Text style={s.badgeText}>{label}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  badge: {
    position: 'absolute',
    top: 6,
    right: 5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  badgeWide: { right: 0 },
  badgeText: { fontFamily: fontFamily.medium, fontSize: 10, lineHeight: 12, color: '#fff' },
});
