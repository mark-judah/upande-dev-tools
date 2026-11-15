import { Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Button } from '@/core/ui/Button';
import { useAuthStore } from '@/core/auth/store';
import { APP_NAME, APP_VERSION } from '@/core/version';
import { COLORS, fontFamily, fontSize } from '@/core/theme';

export default function Settings() {
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);
  const instanceUrl = useAuthStore((s) => s.instanceUrl);
  const logout = useAuthStore((s) => s.logout);
  return (
    <Screen title="Settings">
      <Card title="Account">
        <Text style={s.strong}>{fullName}</Text>
        <Text style={s.muted}>{email}</Text>
        <Text style={s.muted}>{instanceUrl}</Text>
      </Card>
      <Card title="About">
        <Text style={s.muted}>{APP_NAME} v{APP_VERSION}</Text>
      </Card>
      <Button label="Sign out" variant="outline" onPress={async () => { await logout(); router.replace('/login'); }} />
    </Screen>
  );
}

const s = StyleSheet.create({
  strong: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
});
