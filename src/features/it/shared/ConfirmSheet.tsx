import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/core/ui/Dialog';
import { Button } from '@/core/ui/Button';
import { LabeledInput } from '@/core/ui/LabeledInput';
import { mapAxiosError } from '@/core/api/client';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** What will happen, in plain words, naming the person/app/role affected. */
  consequence: string;
  confirmLabel: string;
  /** True for destructive or hard-to-reverse actions: red button. */
  danger?: boolean;
  /** When set, the user must type this exact text to enable the button (delete, reset password, purge). */
  typeToConfirm?: string;
  /** Runs the action. Throw to show the error inline; the sheet closes on success. */
  onConfirm: () => Promise<void>;
};

/**
 * One confirmation pattern for every risky IT action. The server asks for no confirmation at all,
 * so the app does: tap-to-confirm for status changes, consequence text for grants, and
 * type-the-name for delete / reset password / reset rules / purge.
 */
export function ConfirmSheet({ visible, onClose, title, consequence, confirmLabel, danger, typeToConfirm, onConfirm }: Props) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setTyped('');
    setError(null);
    onClose();
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setTyped('');
      onClose();
    } catch (e) {
      setError(mapAxiosError(e).message);
    } finally {
      setBusy(false);
    }
  };

  const ready = !typeToConfirm || typed.trim() === typeToConfirm;

  return (
    <BottomSheet visible={visible} onClose={close} title={title} busy={busy}>
      <Text style={s.body}>{consequence}</Text>
      {typeToConfirm ? (
        <LabeledInput
          label={`Type ${typeToConfirm} to confirm`}
          value={typed}
          onChangeText={setTyped}
          autoCapitalize="none"
          autoCorrect={false}
        />
      ) : null}
      {error ? <Text style={s.error}>{error}</Text> : null}
      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        <Button label={confirmLabel} onPress={run} loading={busy} disabled={!ready} color={danger ? COLORS.danger : undefined} />
        <Button label="Cancel" variant="ghost" onPress={close} disabled={busy} />
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text, lineHeight: 22 },
  error: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.danger, marginTop: spacing.sm },
});
