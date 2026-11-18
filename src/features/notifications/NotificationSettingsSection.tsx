import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/core/ui/Card';
import { Row } from '@/core/ui/Row';
import { Button } from '@/core/ui/Button';
import { useToast } from '@/core/ui/Toast';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { KIND_LABELS, useNotificationStore, type Kind } from './notification-store';
import { buildProblem, permissionState, sendTestNotification, turnOffPush, turnOnPush } from './push';
import { isBuildProblem, pushMessage } from './push-model';
import { useInbox } from './inbox-store';

type Status = 'on' | 'connecting' | 'off' | 'blocked' | 'unavailable';

const STATUS_TEXT: Record<Status, string> = {
  on: 'On',
  connecting: 'On, connecting',
  off: 'Off',
  blocked: 'Blocked in system settings',
  unavailable: 'Not available in this build',
};

/** The Notifications card on the Settings page: push status with one clear action, the inbox, and alert types. */
export function NotificationSettingsSection() {
  const enabled = useNotificationStore((s) => s.enabled);
  const phase = useNotificationStore((s) => s.phase);
  const problem = useNotificationStore((s) => s.problem);
  const message = useNotificationStore((s) => s.message);
  const kinds = useNotificationStore((s) => s.kinds);
  const setKind = useNotificationStore((s) => s.setKind);
  const unread = useInbox((s) => s.unread);
  const toast = useToast();
  const [perm, setPerm] = useState<'granted' | 'ask' | 'blocked' | 'unknown'>('unknown');
  const [busy, setBusy] = useState(false);
  const build = buildProblem();

  const refreshPerm = useCallback(() => {
    void permissionState().then(setPerm);
  }, []);

  // Coming back from the phone's settings may have changed the permission.
  useEffect(() => {
    refreshPerm();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && refreshPerm());
    return () => sub.remove();
  }, [refreshPerm]);

  const runtimeBuildProblem = problem && isBuildProblem(problem) ? problem : null;
  const status: Status =
    build || runtimeBuildProblem
      ? 'unavailable'
      : perm === 'blocked'
        ? 'blocked'
        : enabled && perm === 'granted'
          ? phase === 'registered'
            ? 'on'
            : 'connecting'
          : 'off';
  const detail =
    status === 'unavailable'
      ? pushMessage((build ?? runtimeBuildProblem)!)
      : status === 'blocked'
        ? pushMessage('blocked')
        : status === 'connecting'
          ? (message ?? 'Registering this phone...')
          : status === 'on'
            ? 'Alerts for deployments, tasks and requests come to this phone.'
            : 'Turn on to get alerts for deployments, new tasks and request updates on this phone.';

  const turnOn = async () => {
    setBusy(true);
    try {
      const res = await turnOnPush();
      refreshPerm();
      if (res.ok) toast.showSuccess('Push notifications on');
      else toast.showError(res.message);
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await turnOffPush();
      toast.showInfo('Push notifications off');
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    const err = await sendTestNotification();
    if (err) toast.showError(err);
  };

  return (
    <Card title="Notifications">
      <View style={s.statusRow}>
        <Ionicons
          name={status === 'on' ? 'notifications' : status === 'off' || status === 'connecting' ? 'notifications-outline' : 'notifications-off-outline'}
          size={22}
          color={COLORS.text}
        />
        <View style={{ flex: 1 }}>
          <Text style={s.status}>Push: {STATUS_TEXT[status]}</Text>
          <Text style={s.detail}>{detail}</Text>
        </View>
      </View>

      <View style={s.actions}>
        {status === 'off' ? <Button label="Turn on" onPress={turnOn} loading={busy} /> : null}
        {status === 'blocked' ? <Button label="Open system settings" onPress={() => Linking.openSettings().catch(() => {})} /> : null}
        {status === 'on' || status === 'connecting' ? <Button label="Turn off" variant="outline" onPress={turnOff} loading={busy} /> : null}
        {perm === 'granted' && status !== 'unavailable' ? <Button label="Send me a test notification" variant="ghost" onPress={test} /> : null}
      </View>

      <Row
        title="Inbox"
        subtitle={unread ? `${unread} unread` : 'Everything sent to you, even if a push was missed'}
        left={<Ionicons name="file-tray-outline" size={22} color={COLORS.text} />}
        onPress={() => router.push('/notifications' as never)}
        divider
      />

      <Text style={s.section}>In-app alerts</Text>
      {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
        <View key={k} style={s.kindRow}>
          <Text style={s.kindLabel}>{KIND_LABELS[k]}</Text>
          <Switch value={kinds[k]} onValueChange={(v) => setKind(k, v)} accessibilityLabel={KIND_LABELS[k]} />
        </View>
      ))}
      <Text style={s.detail}>Which alerts pop up while the app is open. Every notification still lands in the inbox.</Text>
    </Card>
  );
}

const s = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  status: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  detail: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, marginTop: 2 },
  actions: { gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.xs },
  section: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: COLORS.textMuted, marginTop: spacing.md, marginBottom: spacing.xs },
  kindRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  kindLabel: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text },
});
