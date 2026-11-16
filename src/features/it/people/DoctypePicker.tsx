import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mapAxiosError } from '@/core/api/client';
import { borderRadius, COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { Empty, ListSkeleton, SearchBox } from './ui';

/** Search-as-you-type list. `fetch` returns {name, hint?} rows; tapping one calls onPick. */
export function SearchList({ fetch, onPick, placeholder, emptyBody }: {
  fetch: (q: string) => Promise<{ name: string; hint?: string }[]>;
  onPick: (name: string, hint?: string) => void;
  placeholder: string;
  emptyBody?: string;
}) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<{ name: string; hint?: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    let live = true;
    fetch(q)
      .then((r) => live && (setError(null), setRows(r)))
      .catch((e) => live && setError(mapAxiosError(e).message));
    return () => {
      live = false;
    };
    // fetch is a fresh closure each render; the query drives reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <View style={{ gap: spacing.sm }}>
      <SearchBox value={text} onChange={setText} placeholder={placeholder} />
      {error ? <Text style={s.err}>{error}</Text> : null}
      {rows === null && !error ? <ListSkeleton rows={4} height={48} /> : null}
      {rows && rows.length === 0 ? <Empty icon="search-outline" title="No matches" body={emptyBody} /> : null}
      {rows?.map((r) => (
        <Pressable
          key={r.name}
          onPress={() => onPick(r.name, r.hint)}
          accessibilityRole="button"
          accessibilityLabel={r.name}
          style={({ pressed }) => [s.item, pressed && { backgroundColor: COLORS.bgMuted }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={s.name} numberOfLines={1}>{r.name}</Text>
            {r.hint ? <Text style={s.hint} numberOfLines={1}>{r.hint}</Text> : null}
          </View>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: COLORS.border, borderRadius: borderRadius.lg },
  name: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text },
  hint: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted },
  err: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: COLORS.danger },
});
