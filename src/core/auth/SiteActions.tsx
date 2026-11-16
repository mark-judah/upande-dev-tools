import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/core/ui/Button';
import { Input } from '@/core/ui/Input';
import { showDialog } from '@/core/ui/DialogHost';
import { useAuthStore } from './store';
import { instanceKey, instanceLabel, knownInstances, siteTitle } from './known-instances';
import type { SiteRow } from './sites';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';

/** Ask first, then wipe every site's session and password backup on this device. */
export function confirmForgetDevice(after?: () => void): void {
  showDialog(
    'Forget this device?',
    'This signs you out of every site and removes every saved password and the fingerprint setup. Your site list stays.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Forget device',
        style: 'destructive',
        onPress: async () => {
          await useAuthStore.getState().forgetDevice();
          after?.();
          router.replace('/login');
        },
      },
    ],
  );
}

/** Rename, sign out of and forget one saved site. Rendered inside a BottomSheet. */
export function SiteActions({
  site,
  onClose,
  onChanged,
}: {
  site: SiteRow;
  /** Closes the sheet (before a confirm dialog opens over it). */
  onClose: () => void;
  onChanged: () => void;
}) {
  const live = useAuthStore((s) => s.instanceUrl);
  const isLive = !!live && instanceKey(live) === instanceKey(site.url);
  const [name, setName] = useState(site.nickname ?? '');

  const save = async () => {
    await knownInstances.rename(site.url, name);
    onChanged();
    onClose();
  };

  const signOut = () => {
    onClose();
    showDialog(
      `Sign out of ${siteTitle(site)}?`,
      'Only this site. Your other sites stay signed in, and this one stays in your list.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            await useAuthStore.getState().signOutSite(site.url);
            onChanged();
            if (isLive) router.replace('/login');
          },
        },
      ],
    );
  };

  const forget = () => {
    onClose();
    showDialog(
      `Forget ${siteTitle(site)}?`,
      `${instanceLabel(site.url)} is removed from this device with its saved session and password. You can add it again any time.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forget',
          style: 'destructive',
          onPress: async () => {
            await useAuthStore.getState().forgetSite(site.url);
            onChanged();
            if (isLive) router.replace('/login');
          },
        },
      ],
    );
  };

  return (
    <View style={s.wrap}>
      <Input
        label="Nickname"
        value={name}
        onChangeText={setName}
        placeholder={instanceLabel(site.url)}
        maxLength={40}
        returnKeyType="done"
        onSubmitEditing={save}
        autoCorrect={false}
        style={s.input}
      />
      <Button label="Save name" onPress={save} disabled={name.trim() === (site.nickname ?? '')} />
      <View style={s.divider} />
      {site.signedIn ? (
        <Action icon="log-out-outline" label="Sign out of this site" onPress={signOut} />
      ) : null}
      <Action icon="trash-outline" label="Forget this site" onPress={forget} danger />
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const color = danger ? COLORS.danger : COLORS.text;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.action, pressed && { opacity: 0.7 }]}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[s.actionLabel, { color }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { gap: spacing.sm },
  input: { minHeight: 48 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginVertical: spacing.sm },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  actionLabel: { flexShrink: 1, fontFamily: fontFamily.medium, fontSize: fontSize.md },
});
