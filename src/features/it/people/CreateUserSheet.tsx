import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BottomSheet } from '@/core/ui/Dialog';
import { Button } from '@/core/ui/Button';
import { DecisionChip } from '@/core/ui/DecisionChip';
import { LabeledInput } from '@/core/ui/LabeledInput';
import { mapAxiosError } from '@/core/api/client';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { useItAccess } from '../shared/useItAccess';
import { post } from '../shared/it-api';
import { EMAIL_RE, generatePassword, list, passwordProblem } from './helpers';
import { Notice, Tag, TagWrap } from './ui';

type Step = 'form' | 'review' | 'done';

/**
 * Create a user in three steps: details, review, result. A generated password is shown once, on the
 * last step, as selectable text; a typed password is never shown. Both are cleared when the sheet closes.
 */
export function CreateUserSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (email: string) => void }) {
  const profiles = useItAccess((st) => st.profiles).filter((p) => p.assignable);
  const [step, setStep] = useState<Step>('form');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mode, setMode] = useState<'generate' | 'type'>('generate');
  const [generated, setGenerated] = useState(() => generatePassword());
  const [typed, setTyped] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; shownPassword: string | null } | null>(null);

  const reset = () => {
    setStep('form');
    setFullName('');
    setEmail('');
    setMode('generate');
    setGenerated(generatePassword());
    setTyped('');
    setChosen([]);
    setError(null);
    setCreated(null);
  };
  const close = () => {
    if (busy) return;
    const email = created?.email;
    reset();
    onClose();
    if (email) onCreated(email);
  };

  const password = mode === 'generate' ? generated : typed;
  const emailOk = EMAIL_RE.test(email.trim());
  const pwProblem = mode === 'type' ? passwordProblem(typed) : null;
  const nameOk = fullName.trim().length > 1;
  const formProblem = !nameOk ? 'Enter their full name.' : !emailOk ? 'Enter a valid email address.' : pwProblem;
  const touched = fullName || email;

  const toggle = (p: string) => setChosen((c) => (c.includes(p) ? c.filter((x) => x !== p) : [...c, p]));
  const gives = Array.from(new Set(profiles.filter((p) => chosen.includes(p.name)).flatMap((p) => p.roles)));

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const addr = email.trim().toLowerCase();
      await post.users('create', { email: addr, full_name: fullName.trim(), password, role_profiles: chosen });
      setCreated({ email: addr, shownPassword: mode === 'generate' ? generated : null });
      setTyped('');
      setStep('done');
    } catch (e) {
      setError(mapAxiosError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet visible={visible} onClose={close} title={step === 'done' ? 'User created' : step === 'review' ? 'Review' : 'Create user'} busy={busy}>
      {step === 'form' ? (
        <View style={{ gap: spacing.md }}>
          <LabeledInput label="Full name" value={fullName} onChangeText={setFullName} autoCapitalize="words" placeholder="Wanjiru Kamau" />
          <LabeledInput
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="name@company.com"
          />
          {email && !emailOk ? <Text style={s.warn}>That email address does not look right.</Text> : null}

          <Text style={s.label}>Password</Text>
          <View style={s.chips}>
            <DecisionChip label="Generate a strong one" selected={mode === 'generate'} onPress={() => setMode('generate')} />
            <DecisionChip label="Type one" selected={mode === 'type'} onPress={() => setMode('type')} />
          </View>
          {mode === 'generate' ? (
            <Text style={s.hint}>A strong password is made for you and shown once after the user is created. Copy it then and hand it over safely. It is never stored in the app.</Text>
          ) : (
            <>
              <LabeledInput label="" value={typed} onChangeText={setTyped} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder="At least 10 characters" accessibilityLabel="Password" />
              {typed && pwProblem ? <Text style={s.warn}>{pwProblem}</Text> : null}
            </>
          )}

          <Text style={s.label}>Role profiles</Text>
          {profiles.length === 0 ? <Text style={s.hint}>No role profiles can be given from here. The user will be created with no access.</Text> : null}
          <View style={s.chips}>
            {profiles.map((p) => (
              <DecisionChip key={p.name} label={p.name} selected={chosen.includes(p.name)} onPress={() => toggle(p.name)} />
            ))}
          </View>
          {chosen.length ? (
            <View style={s.preview} accessibilityLiveRegion="polite">
              <Text style={s.previewTitle}>This gives them:</Text>
              <TagWrap>
                {gives.length ? gives.map((r) => <Tag key={r} label={r} />) : <Tag label="No roles yet" />}
              </TagWrap>
            </View>
          ) : (
            <Text style={s.hint}>With no profile they can sign in but cannot do anything. You can add one later.</Text>
          )}
          <Text style={s.hint}>Profiles with system roles and the IT Team profile are given in Desk by a System Manager.</Text>
          {touched && formProblem ? <Text style={s.warn}>{formProblem}</Text> : null}
          <Button label="Review" onPress={() => { setError(null); setStep('review'); }} disabled={!!formProblem} />
        </View>
      ) : null}

      {step === 'review' ? (
        <View style={{ gap: spacing.md }}>
          <Text style={s.body}>
            You are about to create <Text style={s.strong}>{fullName.trim()}</Text> ({email.trim().toLowerCase()}) as an active system user
            {chosen.length ? ` with ${list(chosen)}` : ' with no role profile'}.
          </Text>
          {gives.length ? <Text style={s.body}>They will be able to act as: {list(gives, 12)}.</Text> : null}
          <Text style={s.body}>{mode === 'generate' ? 'A generated password will be shown once after creation.' : 'They will sign in with the password you typed.'} No welcome email is sent.</Text>
          {error ? <Notice tone="danger" icon="alert-circle-outline">{error}</Notice> : null}
          <Button label="Create user" onPress={submit} loading={busy} />
          <Button label="Back" variant="ghost" onPress={() => setStep('form')} disabled={busy} />
        </View>
      ) : null}

      {step === 'done' && created ? (
        <View style={{ gap: spacing.md }}>
          <Text style={s.body}>
            <Text style={s.strong}>{created.email}</Text> can sign in now.
          </Text>
          {created.shownPassword ? (
            <>
              <Text style={s.label}>Password (shown once)</Text>
              <Text selectable style={s.secret} accessibilityLabel="Generated password">{created.shownPassword}</Text>
              <Notice tone="warn" icon="warning-outline">Press and hold the password to copy it. It disappears when you close this, and cannot be recovered. You can always reset it later.</Notice>
            </>
          ) : null}
          <Button
            label="Done"
            onPress={() => {
              setCreated((c) => (c ? { ...c, shownPassword: null } : c));
              setGenerated('');
              close();
            }}
          />
        </View>
      ) : null}
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.textSecondary },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, lineHeight: 19 },
  warn: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: '#92400E' },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text, lineHeight: 22 },
  strong: { fontFamily: fontFamily.semiBold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  preview: { backgroundColor: COLORS.bgMuted, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.sm },
  previewTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  secret: { fontFamily: 'monospace', fontSize: fontSize.lg, color: COLORS.text, backgroundColor: COLORS.bgMuted, padding: spacing.md, borderRadius: borderRadius.lg, textAlign: 'center' },
});
