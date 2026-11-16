import { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/core/ui/Screen';
import { Card } from '@/core/ui/Card';
import { Button } from '@/core/ui/Button';
import { Skeleton } from '@/core/ui/Skeleton';
import { useToast } from '@/core/ui/Toast';
import { storage, StorageKeys } from '@/core/storage';
import { followDevHost } from '@/core/api/dev-host';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/core/theme';
import { mobileApi, post } from '@/features/it/shared/it-api';
import { ItGate } from '@/features/it/shared/ItGate';
import { ConfirmSheet } from '@/features/it/shared/ConfirmSheet';
import { fmtDate, Note, TONE } from '@/features/it/home/ui';
import { useCountdown, useLive } from '@/features/it/home/useLive';

type StoreApp = { app: string; version: string; released: string; platform: string; size_mb: number | null; file: string };
type StoreList = { apps: StoreApp[] };

function Store() {
  const toast = useToast();
  const { data, loading, error, reload, setData } = useLive(() => mobileApi<StoreList>('store.apps'), []);
  const [confirm, setConfirm] = useState(false);
  const [until, setUntil] = useState<number | null>(null);
  const [dlErr, setDlErr] = useState<string | null>(null);
  const left = useCountdown(until);

  const download = async (a: StoreApp) => {
    setDlErr(null);
    try {
      const base = await storage.get(StorageKeys.instanceUrl);
      if (!base) throw new Error('No server is set.');
      const url = `${followDevHost(base).replace(/\/$/, '')}/api/method/upande_mobile.api.store.download?app=${encodeURIComponent(a.app)}`;
      // Handed to the device browser or installer, never read into JS memory.
      await Linking.openURL(url);
    } catch {
      setDlErr(`Could not open the download for ${a.app}. Try again.`);
    }
  };

  const check = async () => {
    const r = await post.mobileApi<{ refreshed: boolean; retry_in: number } & StoreList>('store.check_updates');
    setUntil(Date.now() + r.retry_in * 1000);
    if (r.apps) setData({ apps: r.apps });
    if (r.refreshed) toast.showSuccess('Checked GitHub. The list is up to date.');
    else toast.showInfo('Someone checked a moment ago. This is the latest list.');
  };

  return (
    <Screen title="App store" loading={loading && !data} error={!data ? error : null} onRetry={reload} onRefresh={reload}>
      {!data ? (
        <View style={{ gap: spacing.md }} accessibilityLabel="Loading apps">
          {[0, 1, 2].map((i) => <Skeleton key={i} height={150} radius={borderRadius.lg} />)}
        </View>
      ) : (
        <>
          <Button
            label={left > 0 ? `Check again in ${left}s` : 'Check for updates'}
            iconLeft="refresh"
            variant="outline"
            disabled={left > 0}
            onPress={() => setConfirm(true)}
          />
          <Note>Checking asks GitHub for every app&apos;s newest release. It is limited to once every 2 minutes for everyone.</Note>
          {dlErr ? <Text style={s.err} accessibilityRole="alert">{dlErr}</Text> : null}
          <View style={{ height: spacing.md }} />
          {data.apps.length === 0 ? (
            <Card>
              <Text style={s.t}>No installable apps yet</Text>
              <Text style={s.b}>An app appears here once it has an APK release.</Text>
            </Card>
          ) : null}
          {data.apps.map((a) => (
            <View key={a.app} style={s.tile} accessible accessibilityLabel={`${a.app} version ${a.version}${a.size_mb ? ', ' + a.size_mb + ' megabytes' : ''}`}>
              <View style={s.top}>
                <View style={s.icon}><Ionicons name="logo-android" size={24} color={TONE.good.accent} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={1}>{a.app}</Text>
                  <Text style={s.sub}>v{a.version} · {a.size_mb ? `${a.size_mb} MB` : 'size unknown'}</Text>
                </View>
              </View>
              <Text style={s.sub}>Released {fmtDate(a.released)} · {a.platform}</Text>
              <Pressable onPress={() => download(a)} accessibilityRole="button" accessibilityLabel={`Download ${a.app}`} style={({ pressed }) => [s.dl, pressed && { opacity: 0.8 }]}>
                <Ionicons name="download-outline" size={20} color="#171717" />
                <Text style={s.dlText}>{`Download ${a.app.replace(/^Upande /, '')}`}</Text>
              </Pressable>
            </View>
          ))}
          <Note>{Platform.OS === 'web' ? 'The APK downloads in your browser.' : 'The APK opens in your browser. If it asks you to sign in, sign in to the same server, then allow "Install unknown apps" for the browser.'}</Note>
        </>
      )}
      <ConfirmSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title="Check for updates"
        consequence="This re-reads every enabled app's newest release from GitHub now, for everyone. Nobody is notified."
        confirmLabel="Check now"
        onConfirm={check}
      />
    </Screen>
  );
}

export default function StoreScreen() {
  return (
    <ItGate title="App store">
      <Store />
    </ItGate>
  );
}

const s = StyleSheet.create({
  tile: { backgroundColor: TONE.ink.bg, borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.md, gap: spacing.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 48, height: 48, borderRadius: 14, backgroundColor: TONE.good.bg, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: '#fff' },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: '#A3A3A3' },
  dl: { marginTop: spacing.sm, minHeight: 48, borderRadius: borderRadius.full, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  dlText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: '#171717' },
  t: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  b: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, marginTop: 4 },
  err: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.danger, marginTop: spacing.sm },
});
