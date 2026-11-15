import { useEffect, useMemo } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, DMSans_400Regular, DMSans_500Medium } from '@expo-google-fonts/dm-sans';
import { Poppins_600SemiBold, Poppins_700Bold } from '@expo-google-fonts/poppins';
import 'react-native-reanimated';
import { ToastProvider } from '@/core/ui/Toast';
import { DialogHost } from '@/core/ui/DialogHost';
import { OfflineBanner } from '@/core/ui/OfflineBanner';
import { DrawerItemsProvider } from '@/core/ui/drawer-items-context';
import { useAuthStore } from '@/core/auth/store';
import { useNetworkStore } from '@/core/network/store';
import { drawerFor } from '@/navigation';
import { NotificationsHost } from '@/features/notifications/NotificationsHost';
import { CaptureHost } from '@/features/capture/CaptureHost';

SplashScreen.preventAutoHideAsync().catch(() => {});

const PUBLIC_ROUTES = ['login', 'biometric-lock', 'no-access'];

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, Poppins_600SemiBold, Poppins_700Bold });

  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrated = useAuthStore((s) => s.hydrated);
  const hasSession = useAuthStore((s) => s.hasSession);
  const biometricLocked = useAuthStore((s) => s.biometricLocked);
  const roles = useAuthStore((s) => s.roles);
  const initNetwork = useNetworkStore((s) => s.init);

  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    hydrate();
    initNetwork();
  }, [hydrate, initNetwork]);

  useEffect(() => {
    if (fontsLoaded && hydrated) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, hydrated]);

  const items = useMemo(() => drawerFor(roles ?? []), [roles]);

  // Auth gate: login -> biometric lock -> (no-access | app).
  useEffect(() => {
    if (!hydrated) return;
    const first = segments[0] as string | undefined;
    if (!hasSession) {
      if (first !== 'login') router.replace('/login');
      return;
    }
    if (biometricLocked) {
      if (first !== 'biometric-lock') router.replace('/biometric-lock' as never);
      return;
    }
    if (items.length === 0) {
      if (first !== 'no-access') router.replace('/no-access' as never);
      return;
    }
    if (first && PUBLIC_ROUTES.includes(first)) router.replace('/');
  }, [hydrated, hasSession, biometricLocked, items.length, segments, router]);

  if (!fontsLoaded || !hydrated) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <DrawerItemsProvider items={items}>
          <ToastProvider>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', gestureEnabled: true }}>
              <Stack.Screen name="biometric-lock" options={{ animation: 'fade' }} />
            </Stack>
            <OfflineBanner />
            <CaptureHost />
            <NotificationsHost />
            <DialogHost />
          </ToastProvider>
        </DrawerItemsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
