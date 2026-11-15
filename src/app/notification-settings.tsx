import { useState } from 'react';
import { Linking, StyleSheet, Switch, Text, View } from 'react-native';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { useToast } from '@/core/ui/Toast';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { KIND_LABELS, useNotificationStore, type Kind } from '@/features/notifications/notification-store';
import { registerPush, requestPermission, unregisterPush } from '@/features/notifications/push';

export default function NotificationSettings() {
  const enabled = useNotificationStore((s) => s.enabled);
  const kinds = useNotificationStore((s) => s.kinds);
  const setEnabled = useNotificationStore((s) => s.setEnabled);
  const setKind = useNotificationStore((s) => s.setKind);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const toggleMaster = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) {
        if (!(await requestPermission())) {
          toast.showError('Notifications are blocked. Allow them in system settings.');
          Linking.openSettings().catch(() => {});
          return;
        }
        await registerPush();
        setEnabled(true);
        toast.showSuccess('Push notifications on');
      } else {
        setEnabled(false);
        await unregisterPush();
        toast.showInfo('Push notifications off');
      }
    } catch (e) {
      if (on) setEnabled(false);
      toast.showError(e instanceof Error ? e.message : 'Could not update notifications');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Notifications">
      <Card>
        <View style={s.row}>
          <View style={s.grow}>
            <Text style={s.label}>Push notifications</Text>
            <Text style={s.muted}>Send alerts to this device.</Text>
          </View>
          <Switch value={enabled} onValueChange={toggleMaster} disabled={busy} />
        </View>
      </Card>
      <Card title="Alert types">
        {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
          <View key={k} style={s.row}>
            <Text style={[s.label, s.grow]}>{KIND_LABELS[k]}</Text>
            <Switch value={kinds[k]} onValueChange={(v) => setKind(k, v)} disabled={!enabled} />
          </View>
        ))}
        <Text style={s.muted}>These toggles control in-app alerts on this device. The server may still send every type.</Text>
      </Card>
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
  grow: { flex: 1 },
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
});
