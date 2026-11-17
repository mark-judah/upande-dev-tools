import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Skeleton } from '@/core/ui/Skeleton';
import { useToast } from '@/core/ui/Toast';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { useInbox } from './inbox-store';
import { shortAge, type InboxItem } from './inbox-model';
import { safeRoute } from './safe-route';

/**
 * Everything sent to you (deployments, tasks, requests, reminders...), newest first, kept even when a push never
 * arrived. Tap opens the item's screen and marks it read; pull down to refresh; "Mark all read" in the header.
 */
export function InboxScreen() {
  const items = useInbox((s) => s.items);
  const unread = useInbox((s) => s.unread);
  const syncing = useInbox((s) => s.syncing);
  const lastSyncAt = useInbox((s) => s.lastSyncAt);
  const error = useInbox((s) => s.error);
  const available = useInbox((s) => s.available);
  const skewMs = useInbox((s) => s.skewMs);
  const sync = useInbox((s) => s.sync);
  const markRead = useInbox((s) => s.markRead);
  const markAllRead = useInbox((s) => s.markAllRead);
  const toast = useToast();

  useEffect(() => {
    void sync();
  }, [sync]);

  // Ages on the server's clock, so a phone with a wrong clock still says "5m" for something sent five minutes ago.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const serverNow = Math.max(now, lastSyncAt ?? 0) + skewMs;

  const open = (item: InboxItem) => {
    markRead([item.name]);
    const route = safeRoute(item.route);
    if (route) router.push(route as never);
    else if (item.route) toast.showInfo('This notification has nothing to open in the app.');
  };

  const firstLoad = syncing && !lastSyncAt && items.length === 0;

  return (
    <Screen
      title="Inbox"
      onRefresh={() => sync({ full: true })}
      headerRight={
        unread > 0 ? (
          <Pressable onPress={markAllRead} hitSlop={8} style={s.hbtn} accessibilityRole="button" accessibilityLabel="Mark all read">
            <Ionicons name="checkmark-done-outline" size={24} color={COLORS.text} />
          </Pressable>
        ) : undefined
      }
    >
      {!available ? (
        <Text style={s.note}>Your server does not have the notification inbox yet. Push notifications still arrive; this list fills once the server is updated.</Text>
      ) : error ? (
        <Text style={s.note}>{error}</Text>
      ) : null}

      {firstLoad ? (
        <View style={{ gap: spacing.sm }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={68} />)}</View>
      ) : items.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="notifications-outline" size={36} color={COLORS.textMuted} />
          <Text style={s.emptyTitle}>Nothing here yet</Text>
          <Text style={s.emptyBody}>Deployments, new tasks, request updates and reminders sent to you appear here.</Text>
        </View>
      ) : (
        items.map((i) => (
          <Card key={i.name} onPress={() => open(i)} accessibilityLabel={`${i.read ? '' : 'Unread. '}${i.title}. ${i.body}`}>
            <View style={s.head}>
              {!i.read ? <View style={s.dot} /> : null}
              <Text style={[s.title, !i.read && s.titleUnread]} numberOfLines={2}>{i.title}</Text>
              <Text style={s.age}>{shortAge(i.createdMs, serverNow)}</Text>
            </View>
            {i.body ? <Text style={s.body} numberOfLines={3}>{i.body}</Text> : null}
          </Card>
        ))
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  hbtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -spacing.sm },
  note: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary, marginBottom: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.text },
  title: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.textSecondary },
  titleUnread: { fontFamily: fontFamily.semiBold, color: COLORS.text },
  age: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary, marginTop: 4 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  emptyTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text },
  emptyBody: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, textAlign: 'center' },
});
