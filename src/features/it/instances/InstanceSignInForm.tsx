import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/core/ui/Button';
import { LabeledInput } from '@/core/ui/LabeledInput';
import { useAuthStore } from '@/core/auth/store';
import { connectInstance, type ConnectStep } from '@/core/it-source/connect';
import { hostLabel, type ItInstance } from '@/core/it-source/instances-model';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/core/theme';

const DRAFT_KEY = 'it_instance_draft_v1';
const STEP_TEXT: Record<ConnectStep, string> = {
  checking: 'Checking the site...',
  signing_in: 'Signing in...',
  verifying: 'Checking IT Team access...',
};

/**
 * Sign in to an IT instance: a new one (address, email, password) or, with `instance`, the same one again after its
 * session expired (address fixed). Uses the connect flow in src/core/it-source/connect.ts: the address is normalised
 * (https unless it is a local address), the login is tried, and the account must be on the IT Team there. Nothing is
 * saved unless every step passes; on success the instance becomes the active one.
 */
export function InstanceSignInForm({ instance, onDone, onCancel }: { instance?: ItInstance | null; onDone: (i: ItInstance) => void; onCancel: () => void }) {
  const mainEmail = useAuthStore((s) => s.email);
  const resign = !!instance;
  const [url, setUrl] = useState(instance?.url ?? '');
  const [email, setEmail] = useState(instance?.email ?? '');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [step, setStep] = useState<ConnectStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(resign);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A new instance's address and email are a draft: they survive closing the sheet, a failed attempt and a restart.
  useEffect(() => {
    if (resign) return;
    let live = true;
    AsyncStorage.getItem(DRAFT_KEY)
      .catch(() => null)
      .then((raw) => {
        if (!live) return;
        try {
          const d = raw ? (JSON.parse(raw) as { url?: string; email?: string }) : {};
          setUrl(d.url ?? '');
          setEmail(d.email ?? mainEmail ?? '');
        } catch {
          setEmail(mainEmail ?? '');
        }
        loaded.current = true;
      });
    return () => {
      live = false;
    };
  }, [resign, mainEmail]);

  useEffect(() => {
    if (resign || !loaded.current) return;
    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ url, email })).catch(() => {});
  }, [resign, url, email]);

  const ready = !!url.trim() && !!email.trim() && !!password && !step;

  const submit = async () => {
    if (!ready) return;
    setError(null);
    setStep('checking');
    const res = await connectInstance(url, email.trim(), password, (st) => {
      if (mounted.current) setStep(st);
    });
    if (!mounted.current) return;
    setStep(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPassword('');
    if (!resign) AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
    onDone(res.instance);
  };

  return (
    <View>
      {resign ? (
        <Text style={s.lead}>
          Your session on {hostLabel(instance!.url)} has ended. Sign in again to keep managing it.
        </Text>
      ) : null}
      <LabeledInput
        label="Site address"
        value={url}
        onChangeText={(v) => {
          setUrl(v);
          if (error) setError(null);
        }}
        editable={!resign && !step}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="it.example.com"
        returnKeyType="next"
      />
      <LabeledInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        editable={!step}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="username"
        autoComplete="username"
        returnKeyType="next"
      />
      <LabeledInput
        label="Password"
        value={password}
        onChangeText={setPassword}
        editable={!step}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
        autoComplete="password"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />
      <Pressable onPress={() => setShow((v) => !v)} hitSlop={8} accessibilityRole="button" style={s.showRow}>
        <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={COLORS.textMuted} />
        <Text style={s.showText}>{show ? 'Hide password' : 'Show password'}</Text>
      </Pressable>
      {error ? (
        <View style={s.err} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle-outline" size={18} color={COLORS.danger} />
          <Text style={s.errText}>{error}</Text>
        </View>
      ) : null}
      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        <Button label={step ? STEP_TEXT[step] : resign ? 'Sign in again' : 'Add instance'} onPress={submit} loading={!!step} disabled={!ready} />
        <Button label="Cancel" variant="ghost" onPress={onCancel} disabled={!!step} />
      </View>
      <Text style={s.note}>
        A separate sign-in used only for the IT tools. The password goes to that site and is not kept; only the session
        is stored, in the phone&apos;s secure storage. The account must be on the IT Team there.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  lead: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary, marginBottom: spacing.sm },
  showRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  showText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textMuted },
  err: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', backgroundColor: '#FEF2F2', borderRadius: borderRadius.md, padding: spacing.md, marginTop: spacing.xs },
  errText: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: '#991B1B' },
  note: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, textAlign: 'center', marginTop: spacing.md },
});
