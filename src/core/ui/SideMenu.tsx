import { useEffect, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { router, usePathname } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ServerDialog } from '@/core/auth/ServerSection';
import { useAuthStore } from '@/core/auth/store';
import { APP_NAME, APP_VERSION } from '@/core/version';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { TAB_HREFS, visibleGroups } from '@/navigation';
import { useDrawer } from './drawer-store';
import { showDialog } from './DialogHost';

type IconName = keyof typeof Ionicons.glyphMap;

/** The sidebar: every destination, grouped, with the current screen highlighted. Mounted once at the root. */
export function SideMenu() {
  const open = useDrawer((s) => s.open);
  const setOpen = useDrawer((s) => s.setOpen);
  const roles = useAuthStore((s) => s.roles) ?? [];
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);
  const instanceUrl = useAuthStore((s) => s.instanceUrl);
  const logout = useAuthStore((s) => s.logout);
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(Math.max(width * 0.82, 260), 340);

  const [slide] = useState(() => new Animated.Value(-340));
  const [mounted, setMounted] = useState(false);
  const [serverOpen, setServerOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(slide, { toValue: -drawerWidth, duration: 180, useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [open, mounted, slide, drawerWidth]);

  const go = (href: string) => {
    setOpen(false);
    if (href === pathname) return;
    if (TAB_HREFS.includes(href)) router.navigate(href as never);
    else router.push(href as never);
  };

  const confirmSignOut = () => {
    setOpen(false);
    showDialog('Sign out?', 'You will need your password (or fingerprint) to come back.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  const initials = (fullName || email || '?').split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <>
      <Modal visible={mounted} transparent animationType="none" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <View style={s.overlay}>
          <Pressable style={s.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close menu" />
          <Animated.View style={[s.panel, { width: drawerWidth, transform: [{ translateX: slide }] }]}>
            <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left']}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
                <Pressable
                  style={s.profile}
                  onPress={() => go('/settings')}
                  onLongPress={() => {
                    setOpen(false);
                    setServerOpen(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Account and settings"
                >
                  <View style={s.avatar}><Text style={s.avatarText}>{initials}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.name} numberOfLines={1}>{fullName}</Text>
                    <Text style={s.email} numberOfLines={1}>{instanceUrl?.replace(/^https?:\/\//, '') ?? email}</Text>
                  </View>
                </Pressable>

                {visibleGroups(roles).map((g, gi) => (
                  <View key={g.title ?? gi} style={s.group}>
                    {g.title ? <Text style={s.groupTitle}>{g.title.toUpperCase()}</Text> : null}
                    {g.items.map((i) => {
                      const active = isActive(i.href);
                      return (
                        <Pressable
                          key={i.href}
                          onPress={() => go(i.href)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          style={({ pressed }) => [s.item, active && s.itemActive, pressed && !active && { backgroundColor: COLORS.bgMuted }]}
                        >
                          <Ionicons name={i.icon as IconName} size={22} color={active ? '#fff' : COLORS.textSecondary} />
                          <Text style={[s.itemLabel, active && s.itemLabelActive]}>{i.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </ScrollView>

              <View style={s.footer}>
                <Pressable style={s.item} onPress={() => go('/settings')} accessibilityRole="button">
                  <Ionicons name="settings-outline" size={22} color={COLORS.textSecondary} />
                  <Text style={s.itemLabel}>Settings</Text>
                </Pressable>
                <Pressable style={s.item} onPress={confirmSignOut} accessibilityRole="button">
                  <Ionicons name="log-out-outline" size={22} color={COLORS.danger} />
                  <Text style={[s.itemLabel, { color: COLORS.danger }]}>Sign out</Text>
                </Pressable>
                <Text style={s.version}>{APP_NAME} v{APP_VERSION}</Text>
              </View>
            </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>
      <ServerDialog visible={serverOpen} onClose={() => setServerOpen(false)} />
    </>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: COLORS.overlay },
  panel: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: COLORS.surface },
  scroll: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.md },
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.sm, marginBottom: spacing.sm },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.text, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: '#fff' },
  name: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  email: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  group: { marginBottom: spacing.sm },
  groupTitle: { fontFamily: fontFamily.medium, fontSize: 10, letterSpacing: 1.2, color: COLORS.textMuted, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xs },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48, paddingHorizontal: spacing.md, borderRadius: 14 },
  itemActive: { backgroundColor: COLORS.text },
  itemLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
  itemLabelActive: { color: '#fff' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, padding: spacing.md },
  version: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, textAlign: 'center', marginTop: spacing.sm },
});
