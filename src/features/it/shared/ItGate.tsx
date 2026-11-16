import { useEffect, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/core/ui/Screen';
import { Button } from '@/core/ui/Button';
import { Skeleton } from '@/core/ui/Skeleton';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { useItAccess } from './useItAccess';

/**
 * Wrap an IT screen's content: it checks the IT Team gate once, shows a skeleton while checking,
 * and a friendly explanation when the user lacks access. `title` draws the Screen header.
 * Pass `tab` for screens that are sidebar destinations.
 */
export function ItGate({ title, children, tab }: { title: string; children: ReactNode; tab?: boolean }) {
  const status = useItAccess((s) => s.status);
  const message = useItAccess((s) => s.message);
  const check = useItAccess((s) => s.check);

  useEffect(() => {
    check();
  }, [check]);

  if (status === 'yes') return <>{children}</>;

  return (
    <Screen title={title} tab={tab}>
      {status === 'no' ? (
        <View style={s.box}>
          <Ionicons name="lock-closed-outline" size={40} color={COLORS.textMuted} />
          <Text style={s.title}>IT Team access needed</Text>
          <Text style={s.body}>
            The IT tools are for people on the IT Team profile. Ask an administrator to add you, then check again.
          </Text>
          {message ? <Text style={s.small}>{message}</Text> : null}
          <Button label="Check again" onPress={() => check(true)} style={{ alignSelf: 'stretch' }} />
        </View>
      ) : status === 'error' ? (
        <View style={s.box}>
          <Ionicons name="cloud-offline-outline" size={40} color={COLORS.textMuted} />
          <Text style={s.title}>Could not check access</Text>
          {message ? <Text style={s.small}>{message}</Text> : null}
          <Button label="Try again" onPress={() => check(true)} style={{ alignSelf: 'stretch' }} />
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={96} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  box: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.textMuted, textAlign: 'center' },
  small: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, textAlign: 'center' },
});
