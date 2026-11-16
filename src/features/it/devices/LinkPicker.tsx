import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomSheet } from '@/core/ui/Dialog';
import { mapAxiosError } from '@/core/api/client';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';

export type PickItem = { key: string; title: string; sub?: string; value: unknown };

/** A search-as-you-type picker in a sheet. `fetch` gets the (debounced) text and returns the choices. */
export function LinkPicker({ visible, onClose, title, placeholder, fetch, onPick }: {
  visible: boolean;
  onClose: () => void;
  title: string;
  placeholder: string;
  fetch: (q: string) => Promise<PickItem[]>;
  onPick: (item: PickItem) => void;
}) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<PickItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    const t = setTimeout(() => {
      fetch(q)
        .then((r) => { if (live) { setItems(r); setError(null); } })
        .catch((e) => { if (live) setError(mapAxiosError(e).message); });
    }, q ? 300 : 0);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, visible]);

  const close = () => { setQ(''); setItems(null); setError(null); onClose(); };

  return (
    <BottomSheet visible={visible} onClose={close} title={title}>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        style={s.input}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel={placeholder}
      />
      {error ? <Text style={s.error}>{error}</Text> : null}
      {items === null && !error ? <ActivityIndicator color={COLORS.text} style={{ margin: spacing.lg }} /> : null}
      {items?.length === 0 ? <Text style={s.muted}>Nothing found.</Text> : null}
      <View>
        {items?.map((it) => (
          <Pressable key={it.key} onPress={() => { setQ(''); setItems(null); onPick(it); }} accessibilityRole="button" accessibilityLabel={it.title} style={({ pressed }) => [s.row, pressed && { backgroundColor: COLORS.bgMuted }]}>
            <Text style={s.t} numberOfLines={1}>{it.title}</Text>
            {it.sub ? <Text style={s.sub} numberOfLines={1}>{it.sub}</Text> : null}
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  input: { minHeight: 48, borderWidth: 1, borderColor: COLORS.border, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.text, marginBottom: spacing.sm },
  row: { minHeight: 56, justifyContent: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  t: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  sub: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  muted: { fontFamily: fontFamily.regular, fontSize: fontSize.md, color: COLORS.textMuted, textAlign: 'center', padding: spacing.lg },
  error: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.danger },
});
