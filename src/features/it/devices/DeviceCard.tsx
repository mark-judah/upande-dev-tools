import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Pill } from '@/features/shared/Pill';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { ago, batteryColor, flagLabel, STATUS, type DeviceRow } from './model';

const NET: Record<string, keyof typeof Ionicons.glyphMap> = { wifi: 'wifi', cellular: 'cellular', none: 'cloud-offline-outline' };

/** One device in the fleet list. */
export const DeviceCard = memo(function DeviceCard({ d, onPress }: { d: DeviceRow; onPress: (d: DeviceRow) => void }) {
  const st = STATUS[d.status] ?? STATUS.unknown;
  const gone = d.state !== 'Active';
  return (
    <Pressable
      onPress={() => onPress(d)}
      accessibilityRole="button"
      accessibilityLabel={`${d.device}, ${d.owner_name}, ${st.label}${gone ? `, ${d.state}` : ''}`}
      style={({ pressed }) => [s.card, gone && { opacity: 0.7 }, pressed && { backgroundColor: COLORS.bgMuted }]}
    >
      <View style={s.top}>
        <View style={s.icon}>
          <Ionicons name={d.platform === 'ios' ? 'logo-apple' : d.platform === 'android' ? 'phone-portrait-outline' : 'desktop-outline'} size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.model} numberOfLines={1}>{d.device}</Text>
          <Text style={s.sub} numberOfLines={1}>{d.owner_name || 'No owner'} · {d.app}</Text>
        </View>
        <Pill label={gone ? d.state : st.label} tone={gone ? 'danger' : st.tone} />
      </View>

      <View style={s.metrics}>
        <View style={s.metric}>
          <Ionicons name="battery-half-outline" size={16} color={COLORS.textMuted} />
          {d.battery != null ? (
            <>
              <View style={s.bar}>
                <View style={[s.fill, { width: `${Math.max(4, Math.min(100, d.battery))}%`, backgroundColor: batteryColor(d.battery) }]} />
              </View>
              <Text style={s.mv}>{d.battery}%</Text>
            </>
          ) : (
            <Text style={s.mv}>n/a</Text>
          )}
        </View>
        <View style={s.metric}>
          <Ionicons name="save-outline" size={16} color={COLORS.textMuted} />
          <Text style={s.mv}>{d.storage_free_gb != null ? `${d.storage_free_gb} GB free` : 'n/a'}</Text>
        </View>
        <View style={s.metric}>
          <Ionicons name={NET[d.network] ?? 'globe-outline'} size={16} color={COLORS.textMuted} />
          <Text style={s.mv}>{d.network || 'n/a'}</Text>
        </View>
      </View>

      <View style={s.foot}>
        <Text style={s.sub} numberOfLines={1}>v{d.app_version || '?'} · {d.platform} {d.os_version} · {ago(d.last_seen)}</Text>
      </View>
      {d.flags.length ? (
        <View style={s.flags}>
          {d.flags.map((f) => <Pill key={f} label={flagLabel(f)} tone="warn" />)}
        </View>
      ) : null}
    </Pressable>
  );
});

const s = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 44, height: 44, borderRadius: borderRadius.md, backgroundColor: COLORS.text, alignItems: 'center', justifyContent: 'center' },
  model: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bar: { width: 44, height: 6, borderRadius: 3, backgroundColor: COLORS.border, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  mv: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.text },
  foot: {},
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
