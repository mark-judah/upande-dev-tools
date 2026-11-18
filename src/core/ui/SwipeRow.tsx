import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GestureDetector, usePanGesture, type PanGestureActiveEvent } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Ionicons } from '@expo/vector-icons';
import { fontFamily, fontSize, spacing } from '@/core/theme';

export type SwipeAction = {
  /** Short verb shown while swiping and used as the screen-reader action name, e.g. "Done". */
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** Background of the revealed panel. */
  color: string;
  /** Runs when the swipe passes the threshold. The row snaps shut afterwards. */
  onTrigger: () => void;
};

type Props = {
  children: ReactNode;
  /** Swipe the row to the RIGHT to trigger this (the panel appears on the left edge). */
  swipeRight?: SwipeAction;
  /** Swipe the row to the LEFT to trigger this (the panel appears on the right edge). */
  swipeLeft?: SwipeAction;
  disabled?: boolean;
  /** Corner radius of the row inside, so the revealed panel is clipped to the same shape. */
  radius?: number;
};

/**
 * Gesture tuning. The pan only becomes active after a clear sideways move (ACTIVATE_X) and
 * fails as soon as the finger travels FAIL_Y vertically first, so the list underneath keeps
 * the vertical drag. Without the fail offset a slightly diagonal flick activated the swipe
 * and cancelled the scroll.
 */
const ACTIVATE_X = 20;
const FAIL_Y = 10;
const THRESHOLD = 72;
const FRICTION = 1.6;
const MAX_TRAVEL = 160;
const SPRING = { damping: 22, stiffness: 260, mass: 0.6 } as const;

function Panel({ action, side }: { action: SwipeAction; side: 'left' | 'right' }) {
  return (
    <View
      style={[s.panel, { backgroundColor: action.color, alignItems: side === 'left' ? 'flex-start' : 'flex-end' }]}
      accessibilityLabel={`${action.label} (${side === 'left' ? 'swipe right' : 'swipe left'})`}
    >
      <View style={s.panelInner}>
        <Ionicons name={action.icon} size={22} color="#fff" />
        <Text style={s.panelLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{action.label}</Text>
      </View>
    </View>
  );
}

/**
 * A list row with swipe actions. Swipe right or left past the threshold and the action fires
 * (with a haptic) when the finger lifts; the row then springs back and the caller's
 * optimistic update takes over. Taps and long presses inside the row are untouched because
 * the pan never activates without a clear horizontal move.
 * Screen readers get the same actions through the accessibility actions menu.
 */
export function SwipeRow({ children, swipeRight, swipeLeft, disabled, radius }: Props) {
  const tx = useSharedValue(0);
  const canRight = !!swipeRight;
  const canLeft = !!swipeLeft;
  const active = !disabled && (canRight || canLeft);

  // Callers usually pass fresh action objects on every render. Keep the latest in a ref so the gesture is configured
  // once per row (only when the allowed directions change), not on every render of a long list.
  const actions = useRef({ swipeRight, swipeLeft });
  useEffect(() => {
    actions.current = { swipeRight, swipeLeft };
  });
  const fire = useCallback((dir: 'right' | 'left') => {
    const action = dir === 'right' ? actions.current.swipeRight : actions.current.swipeLeft;
    if (!action) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    action.onTrigger();
  }, []);

  const config = useMemo(
    () => ({
      enabled: active,
      activeOffsetX: [-ACTIVATE_X, ACTIVATE_X] as [number, number],
      failOffsetY: [-FAIL_Y, FAIL_Y] as [number, number],
      onUpdate: (e: PanGestureActiveEvent) => {
        'worklet';
        let x = e.translationX / FRICTION;
        if (x > 0 && !canRight) x = 0;
        if (x < 0 && !canLeft) x = 0;
        tx.set(Math.max(-MAX_TRAVEL, Math.min(MAX_TRAVEL, x)));
      },
      onDeactivate: () => {
        'worklet';
        const x = tx.get();
        if (x >= THRESHOLD && canRight) scheduleOnRN(fire, 'right');
        else if (x <= -THRESHOLD && canLeft) scheduleOnRN(fire, 'left');
        tx.set(withSpring(0, SPRING));
      },
      onFinalize: () => {
        'worklet';
        // Cancelled by the system (e.g. the list took over): never leave the row half open.
        if (tx.get() !== 0) tx.set(withSpring(0, SPRING));
      },
    }),
    [active, canLeft, canRight, fire, tx],
  );
  const pan = usePanGesture(config);

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.get() }] }));
  // Panels are invisible at rest, so nothing peeks out behind rounded corners.
  const leftStyle = useAnimatedStyle(() => ({ opacity: tx.get() > 0 ? 1 : 0 }));
  const rightStyle = useAnimatedStyle(() => ({ opacity: tx.get() < 0 ? 1 : 0 }));

  if (!active) return <>{children}</>;

  return (
    <GestureDetector gesture={pan} touchAction="pan-y">
      <View style={[s.container, radius != null && { borderRadius: radius }]}>
        {swipeRight ? (
          <Animated.View style={[StyleSheet.absoluteFill, leftStyle]} pointerEvents="none">
            <Panel action={swipeRight} side="left" />
          </Animated.View>
        ) : null}
        {swipeLeft ? (
          <Animated.View style={[StyleSheet.absoluteFill, rightStyle]} pointerEvents="none">
            <Panel action={swipeLeft} side="right" />
          </Animated.View>
        ) : null}
        <Animated.View
          style={rowStyle}
          accessible={false}
          accessibilityActions={[swipeRight, swipeLeft].filter(Boolean).map((a) => ({ name: (a as SwipeAction).label, label: (a as SwipeAction).label }))}
          onAccessibilityAction={(e) => {
            const hit = [actions.current.swipeRight, actions.current.swipeLeft].find((a) => a?.label === e.nativeEvent.actionName);
            if (hit) hit.onTrigger();
          }}
        >
          {children}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  container: { overflow: 'hidden' },
  panel: { flex: 1, justifyContent: 'center' },
  panelInner: { width: 112, alignItems: 'center', gap: 2, paddingHorizontal: spacing.sm },
  panelLabel: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: '#fff' },
});
