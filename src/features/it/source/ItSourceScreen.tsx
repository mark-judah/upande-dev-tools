import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Row } from '@/core/ui/Row';
import { Button } from '@/core/ui/Button';
import { Segmented } from '@/core/ui/Segmented';
import { LabeledInput } from '@/core/ui/LabeledInput';
import { showDialog } from '@/core/ui/DialogHost';
import { useToast } from '@/core/ui/Toast';
import { useAuthStore } from '@/core/auth/store';
import { connectItSource, type ConnectStep } from '@/core/it-source/connect';
import { sameSite, siteLabel, useItSource } from '@/core/it-source/it-source-store';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';

const DRAFT_KEY = 'it_source_draft_v1';
const STEP_TEXT: Record<ConnectStep, string> = {
  checking: 'Checking the site...',
  signing_in: 'Signing in...',
  verifying: 'Checking IT Team access...',
};

type Mode = 'main' | 'other';

/** Configure where the IT dashboard's data comes from: this site, or another site you sign in to separately. */
export function ItSourceScreen() {
  const toast = useToast();
  const mainUrl = useAuthStore((s) => s.instanceUrl);
  const mainEmail = useAuthStore((s) => s.email);
  const hydrate = useItSource((s) => s.hydrate);
  const source = useItSource((s) => s.source);
  const expired = useItSource((s) => s.expired);
  const sites = useItSource((s) => s.sites);
  const disconnect = useItSource((s) => s.disconnect);
  const forgetSite = useItSource((s) => s.forgetSite);

  const [mode, setMode] = useState<Mode>('main');
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [step, setStep] = useState<ConnectStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const loaded = useRef(false);

  // Restore the unfinished form and the current mode once.
  useEffect(() => {
    (async () => {
      await hydrate();
      const raw = await AsyncStorage.getItem(DRAFT_KEY).catch(() => null);
      try {
        const d = raw ? (JSON.parse(raw) as { url?: string; email?: string }) : {};
        setUrl(d.url ?? '');
        setEmail(d.email ?? mainEmail ?? '');
      } catch {
        setEmail(mainEmail ?? '');
      }
      setMode(useItSource.getState().source ? 'other' : 'main');
      loaded.current = true;
    })();
  }, [hydrate, mainEmail]);

  // The typed address and email are a draft: they survive leaving the screen, a failed attempt and an app restart.
  useEffect(() => {
    if (!loaded.current) return;
    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ url, email })).catch(() => {});
  }, [url, email]);

  const connected = !!source && !expired;
  const showForm = mode === 'other' && (!connected || changing);

  const connect = async () => {
    setError(null);
    setStep('checking');
    const res = await connectItSource(url, email.trim(), password, setStep);
    setStep(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPassword('');
    setChanging(false);
    AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
    toast.showSuccess(`IT data now comes from ${siteLabel(res.source.url)}`);
  };

  const useMain = () => {
    showDialog('Use this site for IT data?', `Crashes, devices, support and users will come from ${siteLabel(mainUrl ?? 'this site')} again. Your sign-in to ${source ? siteLabel(source.url) : 'the other site'} will be removed from this phone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Use this site', onPress: () => void disconnect() },
    ]);
  };

  const pickSaved = (s: { url: string; email: string }) => {
    setUrl(s.url);
    setEmail(s.email);
    setError(null);
  };

  return (
    <Screen title="IT data source" onRefresh={undefined}>
      <Text style={s.lead}>
        The IT tools (crashes, devices, support, users and permissions) read from one site. They do not have to be the same site as your tasks and requests.
      </Text>

      <Card title="Reading IT data from">
        <View style={s.now}>
          <View style={[s.dot, { backgroundColor: expired ? COLORS.warn : COLORS.success }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.host} numberOfLines={1}>{source ? siteLabel(source.url) : siteLabel(mainUrl ?? 'This site')}</Text>
            <Text style={s.sub} numberOfLines={1}>
              {source ? (expired ? `Session expired. Sign in again as ${source.email}` : `Signed in as ${source.fullName || source.email}`) : 'This site, the one you are signed in to'}
            </Text>
          </View>
        </View>
      </Card>

      <Segmented
        value={mode}
        options={[
          { value: 'main', label: 'This site' },
          { value: 'other', label: 'Another site' },
        ]}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
      />

      {mode === 'main' ? (
        <Card>
          <Text style={s.body}>
            IT screens use the same site and session as the rest of the app ({siteLabel(mainUrl ?? 'this site')}). Nothing extra to set up.
          </Text>
          {source ? <Button label="Use this site for IT data" onPress={useMain} style={{ marginTop: spacing.md }} /> : null}
        </Card>
      ) : null}

      {mode === 'other' && connected && !changing ? (
        <Card>
          <Text style={s.body}>
            Support issues, devices, crash reports, app adoption, users and permissions are read from {siteLabel(source.url)}. Tasks, requests and deployments stay on {siteLabel(mainUrl ?? 'your main site')}.
          </Text>
          <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
            <Button label="Use a different site" variant="outline" onPress={() => { setChanging(true); setUrl(''); }} />
            <Button label="Sign out of this site" variant="ghost" onPress={useMain} />
          </View>
        </Card>
      ) : null}

      {showForm ? (
        <>
          {sites.length > 0 ? (
            <Card title="Sites you have used">
              {sites.map((st, i) => (
                <Row
                  key={st.url}
                  title={siteLabel(st.url)}
                  subtitle={st.fullName || st.email}
                  left={<Ionicons name={sameSite(url, st.url) ? 'radio-button-on' : 'radio-button-off'} size={22} color={COLORS.text} />}
                  right={
                    <Pressable
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={`Forget ${siteLabel(st.url)}`}
                      onPress={() => void forgetSite(st.url)}
                    >
                      <Ionicons name="close" size={18} color={COLORS.textMuted} />
                    </Pressable>
                  }
                  onPress={() => pickSaved(st)}
                  divider={i < sites.length - 1}
                  chevron={false}
                />
              ))}
            </Card>
          ) : null}

          <Card title={sites.length ? 'Or add a site' : 'Sign in to the IT site'}>
            <LabeledInput
              label="Site address"
              value={url}
              onChangeText={(v) => {
                setUrl(v);
                if (error) setError(null);
              }}
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
              secureTextEntry={!show}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              autoComplete="password"
              returnKeyType="go"
              onSubmitEditing={() => url.trim() && email.trim() && password && !step && void connect()}
            />
            <Pressable onPress={() => setShow((v) => !v)} hitSlop={8} accessibilityRole="button" style={s.showRow}>
              <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color={COLORS.textMuted} />
              <Text style={s.showText}>{show ? 'Hide password' : 'Show password'}</Text>
            </Pressable>
            {step ? <Text style={s.progress}>{STEP_TEXT[step]}</Text> : null}
            {error ? (
              <View style={s.err}>
                <Ionicons name="alert-circle-outline" size={18} color={COLORS.danger} />
                <Text style={s.errText}>{error}</Text>
              </View>
            ) : null}
            <Button
              label={step ? STEP_TEXT[step] : 'Connect'}
              onPress={connect}
              loading={!!step}
              disabled={!url.trim() || !email.trim() || !password}
              style={{ marginTop: spacing.md }}
            />
            {changing ? <Button label="Cancel" variant="ghost" onPress={() => setChanging(false)} style={{ marginTop: spacing.sm }} /> : null}
          </Card>
          <Text style={s.note}>
            This is a separate sign-in used only for the IT tools. Your password is sent to that site and not kept; only the session is stored, in the phone&apos;s secure storage. The account must be on the IT Team there.
          </Text>
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  lead: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.textSecondary, marginBottom: spacing.md },
  now: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dot: { width: 12, height: 12, borderRadius: 6 },
  host: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text, lineHeight: 22 },
  showRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  showText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textMuted },
  progress: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.textSecondary, marginTop: spacing.sm },
  err: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', backgroundColor: '#FEF2F2', borderRadius: 10, padding: spacing.md, marginTop: spacing.sm },
  errText: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: '#991B1B' },
  note: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, textAlign: 'center', marginTop: spacing.md },
});
