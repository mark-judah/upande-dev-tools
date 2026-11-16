import { StyleSheet, View } from 'react-native';
import { COLORS } from '@/core/theme';

type Props = {
  /** 0..1+ — values above 1 are clamped visually but the colour reflects "exceeded". */
  value: number;
  exceeded?: boolean;
  height?: number;
  /** The value that fills the track. Default 1.5 (packhouse: 1 = target, the track holds 150%). Pass 1 for a plain 0..1 progress bar. */
  scale?: number;
  /** For dark surfaces. */
  trackColor?: string;
  fillColor?: string;
};

export function ProgressBar({ value, exceeded, height = 6, scale = 1.5, trackColor, fillColor }: Props) {
  const clamped = Math.max(0, Math.min(value, scale));
  const widthPct = (clamped / scale) * 100;
  return (
    <View style={[s.track, { height, borderRadius: height / 2 }, trackColor ? { backgroundColor: trackColor } : null]}>
      <View
        style={[
          s.fill,
          { width: `${widthPct}%`, height, borderRadius: height / 2 },
          fillColor ? { backgroundColor: fillColor } : null,
          exceeded ? s.fillExceeded : null,
        ]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  track: { backgroundColor: COLORS.border, overflow: 'hidden' },
  fill: { backgroundColor: COLORS.text },
  fillExceeded: { backgroundColor: COLORS.danger },
});
