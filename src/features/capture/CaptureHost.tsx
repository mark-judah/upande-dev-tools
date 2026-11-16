import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useCaptureUi } from './capture-ui';
import { BottomSheet } from '@/core/ui/Dialog';
import { Button } from '@/core/ui/Button';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { LabeledInput } from '@/core/ui/LabeledInput';
import { useToast } from '@/core/ui/Toast';
import { useAuthStore } from '@/core/auth/store';
import { useNetworkStore } from '@/core/network/store';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { useCaptureQueue, type RequestType } from './capture-queue';

const TYPES: RequestType[] = ['Note', 'Bug', 'Feature', 'Question', 'Master Data'];

/** The capture FAB and sheet, mounted once at the root so it is one tap away on every screen. */
export function CaptureHost() {
  const hasSession = useAuthStore((s) => s.hasSession);
  const locked = useAuthStore((s) => s.biometricLocked);
  const online = useNetworkStore((s) => s.online);
  const submit = useCaptureQueue((s) => s.submit);
  const flush = useCaptureQueue((s) => s.flush);
  const hydrate = useCaptureQueue((s) => s.hydrate);
  const toast = useToast();

  const open = useCaptureUi((s) => s.open);
  const setOpen = useCaptureUi((s) => s.setOpen);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<RequestType>('Note');
  const [details, setDetails] = useState('');
  const [today, setToday] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Retry waiting captures on sign-in, on coming back online and on returning to the app.
  useEffect(() => {
    if (!hasSession || locked) return;
    const run = () => {
      flush().then((n) => n > 0 && toast.showSuccess(n === 1 ? 'Capture synced' : `${n} captures synced`));
    };
    run();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && run());
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSession, locked, online]);

  if (!hasSession || locked) return null;

  const close = () => {
    setOpen(false);
  };

  const onSubmit = async () => {
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    const ok = await submit({
      title: t,
      request_type: type,
      description: details.trim() || undefined,
      addToToday: type === 'Note' && today,
    });
    setBusy(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (ok) toast.showSuccess('Captured');
    else toast.showInfo('Saved on this phone, will send when online');
    setTitle('');
    setDetails('');
    close();
  };

  return (
    <>
      <BottomSheet visible={open} onClose={close} title="Quick capture" busy={busy}>
        <LabeledInput
          label="What is it?"
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Export button hangs on large reports"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={onSubmit}
        />
        <View style={s.chips}>
          {TYPES.map((t) => (
            <DecisionChip key={t} label={t} selected={type === t} onPress={() => setType(t)} />
          ))}
        </View>
        <LabeledInput label="Details (optional)" value={details} onChangeText={setDetails} multiline />
        {type === 'Note' ? (
          <View style={s.row}>
            <Text style={s.rowText}>Make it a task now</Text>
            <Switch value={today} onValueChange={setToday} trackColor={{ true: COLORS.primary }} />
          </View>
        ) : null}
        <Button label="Capture" onPress={onSubmit} loading={busy} disabled={!title.trim()} />
      </BottomSheet>
    </>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  rowText: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
});
