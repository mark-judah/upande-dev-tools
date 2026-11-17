import { Fragment, useEffect, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/core/ui/Screen';
import { Button } from '@/core/ui/Button';
import { Skeleton } from '@/core/ui/Skeleton';
import { ScreenSlotsProvider } from '@/core/ui/screen-slots';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { useActiveInstance, useItInstances } from '@/core/it-source/instances-store';
import { instanceTitle } from '@/core/it-source/instances-model';
import { InstanceSwitcher } from '@/features/it/instances/InstanceSwitcher';
import { openInstancePicker } from '@/features/it/instances/picker-ui';
import { useItAccess } from './useItAccess';

const switcher = <InstanceSwitcher />;

/**
 * Wraps every IT screen. It puts the instance switcher under the header, and only lets the screen render (and so
 * make requests) once there is an active, signed-in instance whose account is on the IT Team. Without an instance it
 * shows "Choose an instance" and calls nothing: the IT screens never read the app's main site.
 *
 * The screen's subtree is keyed by the active instance and its epoch, so switching instance throws away every list,
 * sheet and cached answer of the previous one. `tab` is for screens that are sidebar destinations.
 */
export function ItGate({ title, children, tab }: { title: string; children: ReactNode; tab?: boolean }) {
  const hydrated = useItInstances((s) => s.hydrated);
  const hydrate = useItInstances((s) => s.hydrate);
  const epoch = useItInstances((s) => s.epoch);
  const count = useItInstances((s) => s.list.length);
  const active = useActiveInstance();
  const status = useItAccess((s) => s.status);
  const message = useItAccess((s) => s.message);
  const check = useItAccess((s) => s.check);
  const expired = active?.status === 'expired';
  const activeId = active?.id ?? null;

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Re-checks whenever the active instance changes (the access store resets itself on a switch).
  useEffect(() => {
    if (hydrated && activeId && !expired) void check();
  }, [hydrated, activeId, expired, epoch, check]);

  let body: ReactNode;
  if (!hydrated) {
    body = <Loading />;
  } else if (!active) {
    body = (
      <View style={s.box}>
        <Ionicons name="server-outline" size={40} color={COLORS.textMuted} />
        <Text style={s.title}>Choose an instance</Text>
        <Text style={s.body}>
          The IT tools manage users, apps and devices on a site you pick here, separate from the site you signed in to.
          {count ? ' Choose one of your instances, or add another.' : ' Add the first one to get started.'}
        </Text>
        {count ? <Button label="Choose an instance" onPress={() => openInstancePicker({ kind: 'list' })} style={s.stretch} /> : null}
        <Button label="Add an instance" variant={count ? 'outline' : 'primary'} onPress={() => openInstancePicker({ kind: 'add' })} style={s.stretch} />
      </View>
    );
  } else if (expired) {
    body = (
      <View style={s.box}>
        <Ionicons name="time-outline" size={40} color={COLORS.textMuted} />
        <Text style={s.title}>Session expired</Text>
        <Text style={s.body}>Your sign-in to {instanceTitle(active)} has ended. Sign in again to carry on, or switch to another instance.</Text>
        <Button label="Sign in again" onPress={() => openInstancePicker({ kind: 'resign', id: active.id })} style={s.stretch} />
        <Button label="Switch instance" variant="outline" onPress={() => openInstancePicker({ kind: 'list' })} style={s.stretch} />
      </View>
    );
  } else if (status === 'yes') {
    return (
      <ScreenSlotsProvider top={switcher}>
        <Fragment key={`${activeId}:${epoch}`}>{children}</Fragment>
      </ScreenSlotsProvider>
    );
  } else if (status === 'no') {
    body = (
      <View style={s.box}>
        <Ionicons name="lock-closed-outline" size={40} color={COLORS.textMuted} />
        <Text style={s.title}>IT Team access needed</Text>
        <Text style={s.body}>
          Your account on {instanceTitle(active)} is not on the IT Team profile. Ask an administrator there to add you, then check again.
        </Text>
        {message ? <Text style={s.small}>{message}</Text> : null}
        <Button label="Check again" onPress={() => void check(true)} style={s.stretch} />
        <Button label="Switch instance" variant="outline" onPress={() => openInstancePicker({ kind: 'list' })} style={s.stretch} />
      </View>
    );
  } else if (status === 'error') {
    body = (
      <View style={s.box}>
        <Ionicons name="cloud-offline-outline" size={40} color={COLORS.textMuted} />
        <Text style={s.title}>Could not reach {instanceTitle(active)}</Text>
        {message ? <Text style={s.small}>{message}</Text> : null}
        <Button label="Try again" onPress={() => void check(true)} style={s.stretch} />
        <Button label="Switch instance" variant="outline" onPress={() => openInstancePicker({ kind: 'list' })} style={s.stretch} />
      </View>
    );
  } else {
    body = <Loading />;
  }

  return (
    <ScreenSlotsProvider top={switcher}>
      <Screen title={title} tab={tab}>
        {body}
      </Screen>
    </ScreenSlotsProvider>
  );
}

function Loading() {
  return (
    <View style={{ gap: spacing.md }}>
      <Skeleton height={96} />
      <Skeleton height={64} />
      <Skeleton height={64} />
    </View>
  );
}

const s = StyleSheet.create({
  box: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text, textAlign: 'center' },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.textMuted, textAlign: 'center' },
  small: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, textAlign: 'center' },
  stretch: { alignSelf: 'stretch' },
});
