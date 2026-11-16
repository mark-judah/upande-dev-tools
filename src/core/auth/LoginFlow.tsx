import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/core/ui/Button';
import { BottomSheet } from '@/core/ui/Dialog';
import { useAuthStore } from './store';
import { instanceKey, instanceLabel, siteTitle } from './known-instances';
import { checkSite, cleanSiteInput } from './site-check';
import { loginDraft } from './login-draft';
import { siteSessions } from './site-sessions';
import { loadSites, type SiteRow } from './sites';
import { SiteCard } from './SiteCard';
import { SiteActions } from './SiteActions';
import * as Biometric from '@/core/biometric';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/core/theme';
import { APP_NAME, APP_VERSION } from '@/core/version';

const LOGO = require('@/assets/images/upande_logo.png');

type View_ = 'list' | 'add' | 'credentials';
type Target = { url: string; isNew: boolean; title: string; who: string | null };
type Check =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ok'; input: string; baseUrl: string; host: string }
  | { status: 'error'; message: string };

type Props = {
  /** 'screen': the login route. 'modal': add a site from inside the app. */
  mode: 'screen' | 'modal';
  /** Leave the flow without signing in (modal mode). */
  onCancel?: () => void;
  /** Signed in (or switched into a site): go on to the app. */
  onDone: () => void;
  /** Open straight on this saved site's credentials (its session had expired). */
  initialSiteUrl?: string;
  initialNotice?: string;
};

/**
 * Sites first. The list shows every site this device knows (signed in ones
 * enter with a tap); "Add a site" checks an address, then asks for credentials.
 * What is typed on the add form is a persisted draft that only a successful
 * sign-in clears; the live site and its session are untouched until then.
 */
export function LoginFlow({ mode, onCancel, onDone, initialSiteUrl, initialNotice }: Props) {
  const login = useAuthStore((s) => s.login);
  const biometricLogin = useAuthStore((s) => s.biometricLogin);
  const switchSite = useAuthStore((s) => s.switchSite);
  const biometricEnabled = useAuthStore((s) => s.biometricEnabled);

  const [ready, setReady] = useState(false);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [view, setView] = useState<View_>('list');
  const [target, setTarget] = useState<Target | null>(null);

  // The persisted draft of the add form.
  const [draftUrl, setDraftUrl] = useState('');
  const [draftEmail, setDraftEmail] = useState('');
  const draftLoaded = useRef(false);
  const [check, setCheck] = useState<Check>({ status: 'idle' });

  const [siteEmail, setSiteEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(initialNotice ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [enteringUrl, setEnteringUrl] = useState<string | null>(null);
  const [menuSite, setMenuSite] = useState<SiteRow | null>(null);

  const [bioReady, setBioReady] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const prompted = useRef<string | null>(null);

  const passwordRef = useRef<TextInputInstance>(null);
  const emailRef = useRef<TextInputInstance>(null);

  const email = target?.isNew ? draftEmail : siteEmail;
  const setEmail = (v: string) => {
    if (target?.isNew) setDraftEmail(v);
    else setSiteEmail(v);
    if (err) setErr(null);
  };

  const refreshSites = useCallback(async () => {
    const list = await loadSites();
    setSites(list);
    return list;
  }, []);

  const openCredentials = useCallback(
    async (site: SiteRow | null, url?: string, notice?: string | null) => {
      const u = site?.url ?? url ?? '';
      setTarget({
        url: u,
        isNew: !site,
        title: site ? siteTitle(site) : instanceLabel(u),
        who: site ? site.fullName || site.email || null : null,
      });
      setSiteEmail(site?.email ?? '');
      setPassword('');
      setShowPassword(false);
      setErr(notice ?? null);
      setUsePassword(false);
      setView('credentials');
      const hasPw = site ? !!(await siteSessions.getPassword(site.url)) : false;
      setBioReady(!!site && hasPw && biometricEnabled && Biometric.isModuleAvailable());
    },
    [biometricEnabled],
  );

  // First load.
  useEffect(() => {
    (async () => {
      const [list, draft] = await Promise.all([loadSites(), loginDraft.get()]);
      setSites(list);
      setDraftUrl(draft.url);
      setDraftEmail(draft.email);
      draftLoaded.current = true;
      const initial = initialSiteUrl ? list.find((x) => instanceKey(x.url) === instanceKey(initialSiteUrl)) : null;
      if (initial) await openCredentials(initial, undefined, initialNotice);
      else if (list.length === 0 || mode === 'modal') setView('add');
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Every keystroke on the add form is kept.
  useEffect(() => {
    if (!draftLoaded.current) return;
    loginDraft.set({ url: draftUrl, email: draftEmail });
  }, [draftUrl, draftEmail]);

  const onBiometric = useCallback(async () => {
    if (!target || target.isNew) return;
    setBioBusy(true);
    setErr(null);
    try {
      const res = await biometricLogin(target.url);
      if (res.ok) return onDone();
      if (res.reason === 'cancelled') return;
      if (res.reason === 'no_credentials') {
        setErr('No saved password for this site. Sign in with your password once to enable fingerprint.');
        setUsePassword(true);
        return;
      }
      setErr(res.message ?? "Couldn't verify your fingerprint. Use your password.");
    } finally {
      setBioBusy(false);
    }
  }, [biometricLogin, onDone, target]);

  // Offer the prompt straight away, once per site chosen.
  useEffect(() => {
    if (view !== 'credentials' || !target || !bioReady || usePassword) return;
    if (prompted.current === target.url) return;
    prompted.current = target.url;
    onBiometric();
  }, [view, target, bioReady, usePassword, onBiometric]);

  const enterSite = async (site: SiteRow) => {
    setErr(null);
    if (!site.signedIn) return openCredentials(site);
    setEnteringUrl(site.url);
    try {
      const res = await switchSite(site.url);
      if (res.ok) return onDone();
      await refreshSites();
      await openCredentials(
        { ...site, signedIn: false, email: res.email ?? site.email },
        undefined,
        `Your session on ${siteTitle(site)} has ended. Sign in again.`,
      );
    } finally {
      setEnteringUrl(null);
    }
  };

  const runCheck = async () => {
    if (check.status === 'checking') return;
    const input = cleanSiteInput(draftUrl);
    if (!input) {
      setCheck({ status: 'error', message: 'Type the address of your site, like your-site.upande.com.' });
      return;
    }
    setCheck({ status: 'checking' });
    const res = await checkSite(input);
    if (res.ok) setCheck({ status: 'ok', input, baseUrl: res.baseUrl, host: res.host });
    else setCheck({ status: 'error', message: res.message });
  };

  const continueWithChecked = async () => {
    if (check.status !== 'ok') return;
    const existing = sites.find((x) => instanceKey(x.url) === instanceKey(check.baseUrl));
    if (existing) return openCredentials(existing, undefined, 'This site is already in your list.');
    await openCredentials(null, check.baseUrl);
  };

  const submit = async () => {
    if (!target || submitting) return;
    if (!email.trim() || !password) {
      setErr('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    setErr(null);
    const ok = await login(email.trim(), password, target.url);
    setSubmitting(false);
    if (ok) onDone();
    else setErr(useAuthStore.getState().error ?? 'Login failed.');
  };

  const cancelAdd = () => {
    if (mode === 'modal' || sites.length === 0) return onCancel?.();
    setView('list');
  };

  if (!ready) return <SafeAreaView style={s.safe} />;

  const checkedOk = check.status === 'ok' && check.input === cleanSiteInput(draftUrl);
  const draftHost = draftUrl.trim() ? instanceLabel(cleanSiteInput(draftUrl)) : '';
  const showBio = view === 'credentials' && !!target && !target.isNew && bioReady && !usePassword;

  const errorBox = (msg: string | null) =>
    msg ? (
      <View style={s.errBox} accessibilityRole="alert">
        <Ionicons name="alert-circle-outline" size={18} color={COLORS.danger} />
        <Text style={s.errText}>{msg}</Text>
      </View>
    ) : null;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <KeyboardAwareScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        enableOnAndroid
        extraScrollHeight={40}
      >
        <View style={s.topBar}>
          {view === 'credentials' || (view === 'add' && (sites.length > 0 || mode === 'modal')) ? (
            <Pressable
              onPress={() => {
                setErr(null);
                if (view === 'credentials') {
                  if (target?.isNew) setView('add');
                  else if (mode === 'modal' || sites.length === 0) onCancel?.();
                  else setView('list');
                } else cancelAdd();
              }}
              accessibilityRole="button"
              accessibilityLabel={view === 'add' ? 'Cancel' : 'Back to your sites'}
              style={s.back}
            >
              <Ionicons name="chevron-back" size={24} color={COLORS.text} />
              <Text style={s.backText}>{view === 'add' ? 'Cancel' : mode === 'modal' ? 'Close' : 'Sites'}</Text>
            </Pressable>
          ) : (
            <View style={s.back} />
          )}
        </View>

        <View style={s.brand}>
          <Image source={LOGO} style={s.logo} resizeMode="contain" />
          <Text style={s.appName}>{APP_NAME}</Text>
        </View>

        {view === 'list' ? (
          <View style={s.stack}>
            <Text style={s.heading}>Your sites</Text>
            {sites.map((site) => (
              <SiteCard
                key={site.url}
                site={site}
                busy={enteringUrl === instanceKey(site.url) || enteringUrl === site.url}
                onPress={() => enterSite(site)}
                onMenu={() => setMenuSite(site)}
              />
            ))}
            {err ? errorBox(err) : null}
            <Pressable
              onPress={() => {
                setCheck({ status: 'idle' });
                setView('add');
              }}
              accessibilityRole="button"
              style={({ pressed }) => [s.addCard, pressed && { opacity: 0.75 }]}
            >
              <View style={s.addIcon}>
                <Ionicons name="add" size={24} color={COLORS.text} />
              </View>
              <View style={s.flex}>
                <Text style={s.title} numberOfLines={1}>Add a site</Text>
                <Text style={s.sub} numberOfLines={1}>
                  {draftHost ? `Continue with ${draftHost}` : 'Sign in to another Frappe site'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
            </Pressable>
          </View>
        ) : null}

        {view === 'add' ? (
          <View style={s.stack}>
            <Text style={s.heading}>Add a site</Text>
            <Text style={s.lead}>Type the address of the Frappe site you want to sign in to.</Text>
            <View>
              <Text style={s.label}>Site address</Text>
              <TextInput
                value={draftUrl}
                onChangeText={(v) => {
                  setDraftUrl(v);
                  if (check.status !== 'checking') setCheck({ status: 'idle' });
                }}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="url"
                keyboardType="url"
                inputMode="url"
                placeholder="your-site.upande.com"
                placeholderTextColor={COLORS.textMuted}
                returnKeyType="go"
                onSubmitEditing={checkedOk ? continueWithChecked : runCheck}
                style={[s.input, check.status === 'error' && s.inputError]}
                accessibilityLabel="Site address"
              />
            </View>
            {check.status === 'error' ? errorBox(check.message) : null}
            {checkedOk && check.status === 'ok' ? (
              <View style={s.found}>
                <FoundLine text={`Frappe server reachable at ${check.host}`} />
                <FoundLine text="Upande Dev Tools is installed" />
              </View>
            ) : null}
            {checkedOk ? (
              <Button label="Continue" onPress={continueWithChecked} style={s.big} />
            ) : (
              <Button
                label="Check site"
                onPress={runCheck}
                loading={check.status === 'checking'}
                disabled={!draftUrl.trim()}
                style={s.big}
              />
            )}
          </View>
        ) : null}

        {view === 'credentials' && target ? (
          <View style={s.stack}>
            <View style={s.siteHead}>
              <View style={s.icon}>
                <Ionicons name="globe-outline" size={22} color={COLORS.text} />
              </View>
              <View style={s.flex}>
                <Text style={s.title} numberOfLines={1}>{target.title}</Text>
                <Text style={s.sub} numberOfLines={1}>
                  {target.isNew ? 'New site' : target.who ?? instanceLabel(target.url)}
                </Text>
              </View>
            </View>
            {target.isNew && check.status === 'ok' ? (
              <View style={s.found}>
                <FoundLine text="Frappe server reachable" />
                <FoundLine text="Upande Dev Tools is installed" />
              </View>
            ) : null}

            {showBio ? (
              <>
                {errorBox(err)}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sign in with fingerprint"
                  onPress={onBiometric}
                  disabled={bioBusy}
                  style={({ pressed }) => [s.bioCard, { opacity: bioBusy ? 0.6 : pressed ? 0.85 : 1 }]}
                >
                  <View style={s.bioIcon}>
                    <Ionicons name="finger-print" size={34} color={COLORS.text} />
                  </View>
                  <Text style={s.bioLabel}>{bioBusy ? 'Waiting…' : 'Sign in with fingerprint'}</Text>
                  {target.who ? <Text style={s.sub}>{target.who}</Text> : null}
                </Pressable>
                <Pressable
                  onPress={() => {
                    setErr(null);
                    setUsePassword(true);
                  }}
                  style={s.link}
                >
                  <Text style={s.linkText}>Use password instead</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View>
                  <Text style={s.label}>Email</Text>
                  <TextInput
                    ref={emailRef}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="username"
                    textContentType="username"
                    importantForAutofill="yes"
                    keyboardType="email-address"
                    inputMode="email"
                    placeholder="you@company.com"
                    placeholderTextColor={COLORS.textMuted}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    style={s.input}
                    accessibilityLabel="Email"
                  />
                </View>
                <View>
                  <Text style={s.label}>Password</Text>
                  <View style={[s.pwRow, err ? s.inputError : null]}>
                    <TextInput
                      ref={passwordRef}
                      value={password}
                      onChangeText={(v) => {
                        setPassword(v);
                        if (err) setErr(null);
                      }}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="current-password"
                      textContentType="password"
                      importantForAutofill="yes"
                      placeholder="Your password"
                      placeholderTextColor={COLORS.textMuted}
                      returnKeyType="go"
                      onSubmitEditing={submit}
                      style={s.pwInput}
                      accessibilityLabel="Password"
                    />
                    <Pressable
                      onPress={() => setShowPassword((v) => !v)}
                      accessibilityRole="button"
                      accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                      style={s.eye}
                    >
                      <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={COLORS.textSecondary} />
                    </Pressable>
                  </View>
                </View>
                {errorBox(err)}
                <Button label="Sign in" onPress={submit} loading={submitting} style={s.big} />
                {bioReady && usePassword ? (
                  <Pressable
                    onPress={() => {
                      setErr(null);
                      setUsePassword(false);
                    }}
                    style={s.link}
                  >
                    <Text style={s.linkText}>Use fingerprint instead</Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        ) : null}

        <Text style={s.version}>v{APP_VERSION}</Text>
      </KeyboardAwareScrollView>

      <BottomSheet
        visible={!!menuSite}
        onClose={() => setMenuSite(null)}
        title={menuSite ? siteTitle(menuSite) : ''}
        subtitle={menuSite?.nickname ? instanceLabel(menuSite.url) : undefined}
      >
        {menuSite ? (
          <SiteActions
            site={menuSite}
            onClose={() => setMenuSite(null)}
            onChanged={async () => {
              const list = await refreshSites();
              if (list.length === 0) setView('add');
            }}
          />
        ) : null}
      </BottomSheet>
    </SafeAreaView>
  );
}

function FoundLine({ text }: { text: string }) {
  return (
    <View style={s.foundLine}>
      <Ionicons name="checkmark-circle" size={18} color={COLORS.success} />
      <Text style={s.foundText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bgMuted },
  content: { flexGrow: 1, padding: spacing.xl, paddingTop: spacing.md, maxWidth: 520, width: '100%', alignSelf: 'center' },
  flex: { flex: 1 },
  topBar: { minHeight: 44, justifyContent: 'center', marginBottom: spacing.sm },
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', minHeight: 44, paddingRight: spacing.md },
  backText: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
  brand: { alignItems: 'center', marginBottom: spacing.xl },
  logo: { width: 64, height: 64, marginBottom: spacing.md },
  appName: { fontFamily: fontFamily.bold, fontSize: fontSize.xl, color: COLORS.text, textAlign: 'center' },
  stack: { gap: spacing.lg },
  heading: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: COLORS.text },
  lead: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary, marginTop: -spacing.sm },
  label: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text, marginBottom: spacing.xs },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  inputError: { borderColor: COLORS.danger },
  pwRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: borderRadius.md,
    backgroundColor: COLORS.surface,
    paddingLeft: spacing.md,
  },
  pwInput: { flex: 1, minHeight: 46, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text },
  eye: { width: 48, height: 46, alignItems: 'center', justifyContent: 'center' },
  big: { minHeight: 52 },
  errBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: '#FEF2F2',
  },
  errText: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: '#991B1B', lineHeight: 19 },
  found: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  foundLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  foundText: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.text },
  addCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 68,
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.textMuted,
  },
  addIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  siteHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.surface, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textSecondary, marginTop: 1 },
  bioCard: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  bioIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.bgMuted, alignItems: 'center', justifyContent: 'center' },
  bioLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text },
  link: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  linkText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.primary },
  version: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted, textAlign: 'center', marginTop: spacing.xxl },
});
