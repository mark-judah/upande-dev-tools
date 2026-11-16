import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '@/core/ui/Dialog';
import { showDialog } from '@/core/ui/DialogHost';
import { useToast } from '@/core/ui/Toast';
import { useAuthStore } from './store';
import { instanceKey, instanceLabel, siteTitle } from './known-instances';
import { loadSites, type SiteRow } from './sites';
import { SiteCard } from './SiteCard';
import { SiteActions, confirmForgetDevice } from './SiteActions';
import { LoginFlow } from './LoginFlow';
import { COLORS, borderRadius, fontFamily, fontSize, spacing } from '@/core/theme';

type Pending = { url: string; notice: string } | null;

/**
 * The visible site switcher: a sheet listing every saved site (the live one
 * checked). A signed-in site is one tap away; "Add a site" opens the sign-in
 * flow as a modal over the app, so the live site stays signed in and untouched
 * until the new sign-in succeeds. Opened from the sidebar header and Settings.
 */
export function SiteSwitcherSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const liveUrl = useAuthStore((s) => s.instanceUrl);
  const switchSite = useAuthStore((s) => s.switchSite);
  const { showError } = useToast();

  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [menuSite, setMenuSite] = useState<SiteRow | null>(null);
  const [busyUrl, setBusyUrl] = useState<string | null>(null);
  const [adding, setAdding] = useState<Pending | 'new' | null>(null);

  const refresh = useCallback(async () => {
    setSites(await loadSites());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    loadSites()
      .then((list) => {
        if (!live) return;
        setSites(list);
        setLoaded(true);
        setMenuSite(null);
      })
      .catch(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [visible]);

  const liveKey = instanceKey(liveUrl);

  const enter = async (site: SiteRow) => {
    if (busyUrl) return;
    if (instanceKey(site.url) === liveKey) return onClose();
    if (!site.signedIn) {
      onClose();
      setAdding({ url: site.url, notice: '' });
      return;
    }
    setBusyUrl(site.url);
    try {
      const res = await switchSite(site.url);
      if (res.ok) return onClose();
      onClose();
      setAdding({ url: site.url, notice: `Your session on ${siteTitle(site)} has ended. Sign in again.` });
    } catch {
      showError("Couldn't switch site. Try again.");
    } finally {
      setBusyUrl(null);
    }
  };

  const signOutLive = () => {
    const live = sites.find((x) => instanceKey(x.url) === liveKey);
    onClose();
    showDialog(
      `Sign out of ${live ? siteTitle(live) : 'this site'}?`,
      'Only this site. Your other sites stay signed in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            await useAuthStore.getState().signOutSite();
            router.replace('/login');
          },
        },
      ],
    );
  };

  const pending = adding && adding !== 'new' ? adding : null;

  return (
    <>
      <BottomSheet
        visible={visible}
        onClose={onClose}
        busy={!!busyUrl}
        title={menuSite ? siteTitle(menuSite) : 'Sites'}
        subtitle={menuSite ? (menuSite.nickname ? instanceLabel(menuSite.url) : undefined) : 'Switch site, or add another'}
      >
        {menuSite ? (
          <>
            <Pressable onPress={() => setMenuSite(null)} style={s.backRow} accessibilityRole="button">
              <Ionicons name="chevron-back" size={20} color={COLORS.text} />
              <Text style={s.backText}>All sites</Text>
            </Pressable>
            <SiteActions site={menuSite} onClose={onClose} onChanged={refresh} />
          </>
        ) : !loaded ? (
          <ActivityIndicator color={COLORS.text} />
        ) : (
          <>
            {sites.map((site) => (
              <SiteCard
                key={site.url}
                site={site}
                current={instanceKey(site.url) === liveKey}
                busy={busyUrl === site.url}
                onPress={() => enter(site)}
                onMenu={() => setMenuSite(site)}
              />
            ))}
            <Pressable
              onPress={() => {
                onClose();
                setAdding('new');
              }}
              accessibilityRole="button"
              style={({ pressed }) => [s.addRow, pressed && { opacity: 0.75 }]}
            >
              <Ionicons name="add-circle-outline" size={24} color={COLORS.text} />
              <Text style={s.addText}>Add a site</Text>
            </Pressable>
            <View style={s.footer}>
              <Pressable onPress={signOutLive} accessibilityRole="button" style={s.footLink}>
                <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
                <Text style={[s.footText, { color: COLORS.danger }]} numberOfLines={1}>Sign out of this site</Text>
              </Pressable>
              <Pressable onPress={() => { onClose(); confirmForgetDevice(); }} accessibilityRole="button" style={s.footLink}>
                <Text style={s.footMuted} numberOfLines={1}>Forget this device</Text>
              </Pressable>
            </View>
          </>
        )}
      </BottomSheet>

      <Modal visible={!!adding} animationType="slide" onRequestClose={() => setAdding(null)}>
        {adding ? (
          <LoginFlow
            mode="modal"
            initialSiteUrl={pending?.url}
            initialNotice={pending?.notice || undefined}
            onCancel={() => setAdding(null)}
            onDone={() => setAdding(null)}
          />
        ) : null}
      </Modal>
    </>
  );
}

/** Older name: Settings opens the same switcher. */
export function ServerDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return <SiteSwitcherSheet visible={visible} onClose={onClose} />;
}

const s = StyleSheet.create({
  backRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, alignSelf: 'flex-start' },
  backText: { fontFamily: fontFamily.medium, fontSize: fontSize.md, color: COLORS.text },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.textMuted,
  },
  addText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, paddingTop: spacing.sm },
  footLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  footText: { flexShrink: 1, fontFamily: fontFamily.medium, fontSize: fontSize.md },
  footMuted: { flexShrink: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
});
