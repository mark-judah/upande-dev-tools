import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Row } from '@/core/ui/Row';
import { useAuthStore } from '@/core/auth/store';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { visibleGroups } from '@/navigation';

export function MoreScreen() {
  const roles = useAuthStore((s) => s.roles) ?? [];
  const fullName = useAuthStore((s) => s.fullName);
  const email = useAuthStore((s) => s.email);
  const groups = visibleGroups(roles);
  const initials = (fullName || email || '?').split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <Screen title="More" tab>
      <Card onPress={() => router.push('/settings' as never)} accessibilityLabel="Account and settings">
        <View style={s.profile}>
          <View style={s.avatar}><Text style={s.avatarText}>{initials}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s.name} numberOfLines={1}>{fullName}</Text>
            <Text style={s.email} numberOfLines={1}>{email}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </View>
      </Card>
      {groups.map((g) => (
        <Card key={g.title} title={g.title}>
          {g.items.map((i, idx) => (
            <Row
              key={i.href}
              title={i.label}
              subtitle={i.hint}
              left={<Ionicons name={i.icon as keyof typeof Ionicons.glyphMap} size={22} color={COLORS.text} />}
              onPress={() => router.push(i.href as never)}
              divider={idx < g.items.length - 1}
            />
          ))}
        </Card>
      ))}
    </Screen>
  );
}

const s = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.text, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: '#fff' },
  name: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  email: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
});
