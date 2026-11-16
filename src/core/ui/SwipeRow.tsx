import { useRef, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Swipeable, { SwipeDirection, type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
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
};

function Panel({ action, side }: { action: SwipeAction; side: 'left' | 'right' }) {
  return (
    <View style={[s.panel, { backgroundColor: action.color }]} accessibilityLabel={`${action.label} (${side === 'left' ? 'swipe right' : 'swipe left'})`}>
      <View style={s.panelInner}>
        <Ionicons name={action.icon} size={24} color="#fff" />
        <Text style={s.panelLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{action.label}</Text>
      </View>
    </View>
  );
}

/**
 * A list row with swipe actions. Swipe right or left past the threshold and the action fires
 * (with a haptic); the row then closes, and the caller's optimistic update takes over.
 * Screen readers get the same actions through the accessibility actions menu.
 */
export function SwipeRow({ children, swipeRight, swipeLeft, disabled }: Props) {
  const ref = useRef<SwipeableMethods>(null);

  if (disabled || (!swipeRight && !swipeLeft)) return <>{children}</>;

  const fire = (action: SwipeAction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    action.onTrigger();
    ref.current?.close();
  };

  return (
    <Swipeable
      ref={ref}
      friction={1.6}
      overshootLeft={false}
      overshootRight={false}
      leftThreshold={72}
      rightThreshold={72}
      renderLeftActions={swipeRight ? () => <Panel action={swipeRight} side="left" /> : undefined}
      renderRightActions={swipeLeft ? () => <Panel action={swipeLeft} side="right" /> : undefined}
      onSwipeableOpen={(direction) => {
        // The direction is the way the row moved: RIGHT = swiped right (the panel on the left edge opens).
        if (direction === SwipeDirection.RIGHT && swipeRight) fire(swipeRight);
        else if (direction === SwipeDirection.LEFT && swipeLeft) fire(swipeLeft);
      }}
    >
      <View
        accessible={false}
        accessibilityActions={[swipeRight, swipeLeft].filter(Boolean).map((a) => ({ name: (a as SwipeAction).label, label: (a as SwipeAction).label }))}
        onAccessibilityAction={(e) => {
          const hit = [swipeRight, swipeLeft].find((a) => a?.label === e.nativeEvent.actionName);
          if (hit) hit.onTrigger();
        }}
      >
        {children}
      </View>
    </Swipeable>
  );
}

const s = StyleSheet.create({
  panel: { width: 132, justifyContent: 'center', alignItems: 'center' },
  panelInner: { alignItems: 'center', gap: 2, paddingHorizontal: spacing.sm },
  panelLabel: { fontFamily: fontFamily.bold, fontSize: fontSize.xs, color: '#fff' },
});
