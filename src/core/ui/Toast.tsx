import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { audio } from '@/core/audio';

type ToastKind = 'success' | 'error' | 'info';

export type ToastAction = { label: string; onPress: () => void };
export type ToastOptions = { action?: ToastAction; durationMs?: number };

type ToastState = { kind: ToastKind; message: string; action?: ToastAction; ms: number } | null;

type ToastContextValue = {
  showSuccess: (message: string, opts?: ToastOptions) => void;
  showError: (message: string, opts?: ToastOptions) => void;
  showInfo: (message: string, opts?: ToastOptions) => void;
};

/** Space the toast leaves for the tab bar so it never covers it. */
const ABOVE_TABS = 76;

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState>(null);
  const anim = useState(() => new Animated.Value(0))[0];
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setState(null));
  }, [anim]);

  const present = useCallback(
    (kind: ToastKind, message: string, opts?: ToastOptions) => {
      if (timer.current) clearTimeout(timer.current);
      const ms = opts?.durationMs ?? (opts?.action ? 5500 : kind === 'error' ? 5000 : 2600);
      setState({ kind, message, action: opts?.action, ms });
      Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timer.current = setTimeout(hide, ms);
    },
    [anim, hide],
  );

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const value: ToastContextValue = {
    showSuccess: (message, opts) => { audio.submit(); present('success', message, opts); },
    showError: (message, opts) => { audio.error(); present('error', message, opts); },
    showInfo: (message, opts) => present('info', message, opts),
  };

  const iconName: keyof typeof Ionicons.glyphMap =
    state?.kind === 'success' ? 'checkmark-circle' : state?.kind === 'error' ? 'alert-circle' : 'information-circle';
  const tint = state?.kind === 'success' ? COLORS.success : state?.kind === 'error' ? COLORS.danger : COLORS.primary;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {state ? (
        // Sits above the tab bar; only the toast itself takes touches, so the screen stays usable.
        <View pointerEvents="box-none" style={[styles.wrap, { bottom: ABOVE_TABS + insets.bottom }]}>
          <Animated.View
            accessibilityLiveRegion="polite"
            style={[
              styles.toast,
              { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
            ]}
          >
            <Ionicons name={iconName} size={18} color={tint} />
            <Text style={styles.text} numberOfLines={state.kind === 'error' ? 6 : 3}>{state.message}</Text>
            {state.action ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={10}
                onPress={() => {
                  const run = state.action?.onPress;
                  hide();
                  run?.();
                }}
              >
                <Text style={styles.action}>{state.action.label}</Text>
              </Pressable>
            ) : null}
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 9999 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: COLORS.text,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
    maxWidth: '92%',
  },
  text: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: '#FFFFFF', flexShrink: 1 },
  action: { fontFamily: fontFamily.bold, fontSize: fontSize.sm, color: '#86EFAC', paddingLeft: spacing.sm },
});
