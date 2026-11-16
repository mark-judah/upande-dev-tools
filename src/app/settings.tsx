import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Row } from '@/core/ui/Row';
import { Button } from '@/core/ui/Button';
import { showDialog } from '@/core/ui/DialogHost';
import { ServerDialog } from '@/core/auth/ServerSection';
import { useAuthStore } from '@/core/auth/store';
import { APP_NAME, APP_VERSION } from '@/core/version';
import { COLORS, fontFamily, fontSize } from '@/core/theme';

export default function Settings() {
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);
  const instanceUrl = useAuthStore((s) => s.instanceUrl);
  const logout = useAuthStore((s) => s.logout);
  const [serverOpen, setServerOpen] = useState(false);

  const confirmSignOut = () =>
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

  return (
    <Screen title="Settings">
      <Card title="Account">
        <Text style={s.strong}>{fullName}</Text>
        <Text style={s.muted}>{email}</Text>
      </Card>
      <Card title="Server">
        <Row
          title={instanceUrl ?? 'Not set'}
          subtitle="Tap to switch server"
          left={<Ionicons name="server-outline" size={22} color={COLORS.text} />}
          onPress={() => setServerOpen(true)}
        />
      </Card>
      <Card title="About">
        <Text style={s.muted}>{APP_NAME} v{APP_VERSION}</Text>
      </Card>
      <Button label="Sign out" variant="outline" onPress={confirmSignOut} />
      <ServerDialog visible={serverOpen} onClose={() => setServerOpen(false)} />
    </Screen>
  );
}

const s = StyleSheet.create({
  strong: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
});
