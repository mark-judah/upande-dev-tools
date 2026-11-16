import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/core/ui/Dialog';
import { Button } from '@/core/ui/Button';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { LabeledInput } from '@/core/ui/LabeledInput';
import { mapAxiosError } from '@/core/api/client';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/core/theme';
import { post } from '../shared/it-api';
import { generatePassword, passwordProblem } from './helpers';
import { Notice } from './ui';

/** Type the person's id to confirm, choose generated or typed, then the result. A generated password is shown once; nothing is kept after close. */
export function ResetPasswordSheet({ visible, onClose, user }: { visible: boolean; onClose: () => void; user: { name: string; full_name: string } }) {
  const [mode, setMode] = useState<'generate' | 'type'>('generate');
  const [typed, setTyped] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const close = () => {
    if (busy) return;
    setTyped('');
    setConfirmText('');
    setShown(null);
    setDone(false);
    setError(null);
    setMode('generate');
    onClose();
  };

  const problem = mode === 'type' ? passwordProblem(typed) : null;
  const ready = confirmText.trim() === user.name && !problem && (mode === 'generate' || typed.length > 0);

  const run = async () => {
    setBusy(true);
    setError(null);
    const pw = mode === 'generate' ? generatePassword() : typed;
    try {
      await post.users('reset_password', { name: user.name, password: pw });
      setShown(mode === 'generate' ? pw : null);
      setTyped('');
      setDone(true);
    } catch (e) {
      setError(mapAxiosError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={close} title={done ? 'Password reset' : 'Reset password'} subtitle={user.full_name} busy={busy}>
      {done ? (
        <View style={{ gap: spacing.md }}>
          <Text style={s.body}>The password for {user.full_name} has been changed. Their current sessions may need to sign in again.</Text>
          {shown ? (
            <>
              <Text style={s.label}>New password (shown once)</Text>
              <Text selectable style={s.secret} accessibilityLabel="Generated password">{shown}</Text>
              <Notice tone="warn" icon="warning-outline">Press and hold to copy. It disappears when you close this and cannot be recovered.</Notice>
            </>
          ) : null}
          <Button label="Done" onPress={close} />
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          <Text style={s.body}>{user.full_name} ({user.name}) will have to use the new password to sign in. The old one stops working immediately.</Text>
          <View style={s.chips}>
            <DecisionChip label="Generate a strong one" selected={mode === 'generate'} onPress={() => setMode('generate')} />
            <DecisionChip label="Type one" selected={mode === 'type'} onPress={() => setMode('type')} />
          </View>
          {mode === 'type' ? (
            <>
              <LabeledInput label="" value={typed} onChangeText={setTyped} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="At least 10 characters" accessibilityLabel="New password" />
              {typed && problem ? <Text style={s.warn}>{problem}</Text> : null}
            </>
          ) : (
            <Text style={s.hint}>A strong password is made when you confirm and shown once afterwards.</Text>
          )}
          <LabeledInput label={`Type ${user.name} to confirm`} value={confirmText} onChangeText={setConfirmText} autoCapitalize="none" autoCorrect={false} />
          {error ? <Text style={s.err}>{error}</Text> : null}
          <Button label="Reset password" color={COLORS.danger} onPress={run} loading={busy} disabled={!ready} />
          <Button label="Cancel" variant="ghost" onPress={close} disabled={busy} />
        </View>
      )}
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text, lineHeight: 22 },
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.textSecondary },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  warn: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: '#92400E' },
  err: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.danger },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  secret: { fontFamily: 'monospace', fontSize: fontSize.lg, color: COLORS.text, backgroundColor: COLORS.bgMuted, padding: spacing.md, borderRadius: borderRadius.lg, textAlign: 'center' },
});
