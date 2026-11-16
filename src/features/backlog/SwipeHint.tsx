import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { storage } from '@/core/storage';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';

const KEY = 'swipe_hint_seen_v1';

/** One-time, dismissible tip so the swipe gestures are discoverable. Remembered across restarts. */
export function SwipeHint({ style }: { style?: object }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    storage
      .get(KEY)
      .then((v) => setShow(!v))
      .catch(() => {});
  }, []);

  if (!show) return null;
  const dismiss = () => {
    setShow(false);
    storage.set(KEY, '1').catch(() => {});
  };
  return (
    <View style={[s.wrap, style]} accessibilityRole="summary">
      <Ionicons name="swap-horizontal" size={20} color="#fff" />
      <Text style={s.text} numberOfLines={2}>
        Swipe right to finish, left to start
      </Text>
      <Pressable onPress={dismiss} hitSlop={8} style={s.btn} accessibilityRole="button" accessibilityLabel="Dismiss tip">
        <Text style={s.btnText}>Got it</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52, paddingLeft: spacing.md, paddingRight: spacing.xs, backgroundColor: COLORS.text, borderRadius: 16 },
  text: { flex: 1, fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: '#fff' },
  btn: { minHeight: 44, minWidth: 64, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: '#86EFAC' },
});
