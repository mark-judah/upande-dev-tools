import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '@/core/ui/Button';
import { useAuthStore } from '@/core/auth/store';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';

export function NoAccess() {
  const logout = useAuthStore((s) => s.logout);
  return (
    <View style={s.wrap}>
      <Text style={s.title}>No access</Text>
      <Text style={s.body}>Your account has no developer role. Ask an administrator to add you to Dev Team.</Text>
      <Button label="Sign out" onPress={async () => { await logout(); router.replace('/login'); }} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md, backgroundColor: COLORS.bgMuted },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: COLORS.text },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.textMuted },
});
