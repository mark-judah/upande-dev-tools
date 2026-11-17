import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SettingsScreen } from '@upande/mobile-kit';
import { SiteSwitcherSheet } from '@/core/auth/ServerSection';
import { useAuthStore } from '@/core/auth/store';
import { instanceLabel } from '@/core/auth/known-instances';
import { hasDevAccess } from '@/navigation';
import { InstancesSettingsSection } from '@/features/it/instances/InstancesSettingsSection';
import { NotificationSettingsSection } from '@/features/notifications/NotificationSettingsSection';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';

/**
 * The app's ONE Settings page: the kit's page (profile, fingerprint, help, diagnostics, versions and updates,
 * devices, sign out) plus this app's own sections. The kit already has account and sign-out, so only the main
 * server switch (under the profile), IT instances and Notifications are added here.
 */
export default function SettingsRoute() {
  const instanceUrl = useAuthStore((s) => s.instanceUrl);
  const roles = useAuthStore((s) => s.roles);
  const [serverOpen, setServerOpen] = useState(false);
  const dev = hasDevAccess(roles ?? []);

  return (
    <>
      <SettingsScreen
        profileExtra={
          <Pressable
            onPress={() => setServerOpen(true)}
            style={({ pressed }) => [s.site, pressed && { opacity: 0.75 }]}
            accessibilityRole="button"
            accessibilityLabel="Switch site"
          >
            <Ionicons name="globe-outline" size={18} color={COLORS.textSecondary} />
            <Text style={s.siteText} numberOfLines={1}>
              {instanceUrl ? instanceLabel(instanceUrl) : 'No site'}
            </Text>
            <Text style={s.siteAction}>Switch site</Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
          </Pressable>
        }
        extraSections={
          <>
            <NotificationSettingsSection />
            {dev ? <InstancesSettingsSection /> : null}
          </>
        }
      />
      <SiteSwitcherSheet visible={serverOpen} onClose={() => setServerOpen(false)} />
    </>
  );
}

const s = StyleSheet.create({
  site: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: 14,
    backgroundColor: COLORS.bgMuted,
  },
  siteText: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text },
  siteAction: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textSecondary },
});
