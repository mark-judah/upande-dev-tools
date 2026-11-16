import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Skeleton } from '@/core/ui/Skeleton';
import { Button } from '@/core/ui/Button';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { initials } from './helpers';

export function Avatar({ name, size = 44, dim }: { name: string; size?: number; dim?: boolean }) {
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2, opacity: dim ? 0.45 : 1 }]}>
      <Text style={[s.avatarText, { fontSize: size * 0.36 }]}>{initials(name)}</Text>
    </View>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <View style={s.search}>
      <Ionicons name="search" size={18} color={COLORS.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={placeholder}
        style={s.searchInput}
      />
      {value ? (
        <Pressable onPress={() => onChange('')} hitSlop={10} accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={18} color={COLORS.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** A small tag (roles, profiles). Not tappable; use DecisionChip for choices. */
export function Tag({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'dark' | 'warn' | 'danger' }) {
  const bg = tone === 'dark' ? COLORS.text : tone === 'warn' ? '#FFFBEB' : tone === 'danger' ? '#FEF2F2' : '#E8E8E8';
  const fg = tone === 'dark' ? '#fff' : tone === 'warn' ? '#92400E' : tone === 'danger' ? '#991B1B' : COLORS.textSecondary;
  return (
    <View style={[s.tag, { backgroundColor: bg }]}>
      <Text style={[s.tagText, { color: fg }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

export function TagWrap({ children }: { children: ReactNode }) {
  return <View style={s.tagWrap}>{children}</View>;
}

export function Section({ title, hint, right, children }: { title: string; hint?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle} accessibilityRole="header">{title}</Text>
        {right}
      </View>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
      {children}
    </ScrollView>
  );
}

export function Notice({ icon = 'information-circle-outline', tone = 'info', children }: { icon?: keyof typeof Ionicons.glyphMap; tone?: 'info' | 'warn' | 'danger'; children: ReactNode }) {
  const bg = tone === 'warn' ? '#FFFBEB' : tone === 'danger' ? '#FEF2F2' : COLORS.bgMuted;
  const fg = tone === 'warn' ? '#92400E' : tone === 'danger' ? '#991B1B' : COLORS.textSecondary;
  return (
    <View style={[s.notice, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={20} color={fg} />
      <Text style={[s.noticeText, { color: fg }]}>{children}</Text>
    </View>
  );
}

export function ListSkeleton({ rows = 6, height = 68 }: { rows?: number; height?: number }) {
  return (
    <View style={{ gap: spacing.sm }} accessibilityLabel="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={height} radius={borderRadius.lg} />
      ))}
    </View>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={s.empty}>
      <Ionicons name="cloud-offline-outline" size={36} color={COLORS.textMuted} />
      <Text style={s.emptyTitle}>Could not load</Text>
      <Text style={s.emptyBody}>{message}</Text>
      <Button label="Try again" onPress={onRetry} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}

export function Empty({ icon, title, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; body?: string }) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={36} color={COLORS.textMuted} />
      <Text style={s.emptyTitle}>{title}</Text>
      {body ? <Text style={s.emptyBody}>{body}</Text> : null}
    </View>
  );
}

export const textStyles = StyleSheet.create({
  title: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text, lineHeight: 22 },
});

const s = StyleSheet.create({
  avatar: { backgroundColor: COLORS.text, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fontFamily.semiBold, color: '#fff' },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: borderRadius.lg,
  },
  searchInput: { flex: 1, minHeight: 44, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text },
  tag: { borderRadius: borderRadius.full, paddingHorizontal: spacing.sm + 2, paddingVertical: 3, maxWidth: '100%' },
  tagText: { fontFamily: fontFamily.medium, fontSize: 12 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 28 },
  sectionTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  chipRow: { gap: spacing.sm, paddingVertical: 2, paddingRight: spacing.lg },
  notice: { flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderRadius: borderRadius.lg, alignItems: 'flex-start' },
  noticeText: { flex: 1, fontFamily: fontFamily.regular, fontSize: fontSize.sm, lineHeight: 19 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl, paddingHorizontal: spacing.lg },
  emptyTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.lg, color: COLORS.text },
  emptyBody: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.textMuted, textAlign: 'center' },
});
