import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from '@/core/ui/Card';
import { Skeleton } from '@/core/ui/Skeleton';
import { useAuthStore } from '@/core/auth/store';
import { mapAxiosError } from '@/core/api/client';
import { COLORS, fontFamily, fontSize, spacing } from '@/core/theme';
import { Avatar } from '@/features/detail/parts';
import { LinkText } from '@/features/detail/html';
import { ago, fullDate, localStamp } from '@/features/detail/format';
import { addComment, getComments, type Comment } from './comments-api';

type Row = Comment & { pending?: boolean; failed?: boolean };

/** Kept for existing imports. Frappe timestamps are server-local strings, so this is `ago`. */
export const relativeTime = (creation: string, now = Date.now()) => ago(creation, now);

/** Loads and posts comments for a record. Local rows (sending or failed) stay under the server's. */
export function useComments(doctype: string, name: string, onSent?: () => void) {
  const email = useAuthStore((s) => s.email);
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const seq = useRef(0);
  const inputRef = useRef<TextInputInstance>(null);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const list = await getComments(doctype, name);
      if (mine !== seq.current) return;
      setRows((prev) => [...list, ...prev.filter((r) => r.pending || r.failed)]);
      setError(null);
    } catch (e) {
      if (mine === seq.current) setError(mapAxiosError(e).message);
    } finally {
      if (mine === seq.current) setLoaded(true);
    }
  }, [doctype, name]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const send = useCallback(
    async (id: string, body: string) => {
      setRows((prev) => prev.map((r) => (r.name === id ? { ...r, pending: true, failed: false } : r)));
      try {
        await addComment(doctype, name, body);
        setRows((prev) => prev.filter((r) => r.name !== id));
        await load();
        onSent?.();
      } catch {
        setRows((prev) => prev.map((r) => (r.name === id ? { ...r, pending: false, failed: true } : r)));
      }
    },
    [doctype, name, load, onSent],
  );

  const submit = useCallback(() => {
    const body = text.trim();
    if (!body) return;
    const id = `local-${Date.now()}`;
    setRows((prev) => [
      ...prev,
      { name: id, content: body, comment_by: email ?? '', full_name: 'You', creation: localStamp(), pending: true },
    ]);
    setText('');
    onSent?.();
    send(id, body);
  }, [text, email, send, onSent]);

  return { rows, loaded, error, text, setText, submit, send, reload: load, inputRef, email };
}

type Thread = ReturnType<typeof useComments>;

/** The thread itself: sits inside the page's scroll view. */
export function CommentList({ thread }: { thread: Thread }) {
  const { rows, loaded, error, email, send, reload, inputRef } = thread;
  return (
    <Card title={rows.length ? `Comments (${rows.length})` : 'Comments'}>
      {error ? (
        <Pressable onPress={reload} accessibilityRole="button" style={s.errorBox}>
          <Text style={s.error}>{error}</Text>
          <Text style={s.retry}>Tap to retry</Text>
        </Pressable>
      ) : null}
      {!loaded && !error ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={14} />
          <Skeleton width="70%" height={14} />
        </View>
      ) : null}
      {loaded && rows.length === 0 && !error ? (
        <Pressable onPress={() => inputRef.current?.focus()} accessibilityRole="button" accessibilityLabel="Write the first comment" style={s.empty}>
          <Ionicons name="chatbubble-ellipses-outline" size={30} color={COLORS.textMuted} />
          <Text style={s.emptyTitle}>No comments yet</Text>
          <Text style={s.emptyText}>Ask a question or leave an update. Be the first to write something.</Text>
        </Pressable>
      ) : null}
      {rows.map((r, i) => {
        const mine = !!email && r.comment_by === email;
        const who = mine ? 'You' : r.full_name || r.comment_by;
        return (
          <View key={r.name} style={[s.item, i > 0 && s.itemBorder, r.pending && s.dim]}>
            <Avatar name={who} size={32} />
            <View style={s.itemBody}>
              <View style={s.head}>
                <Text style={s.who} numberOfLines={1}>{who}</Text>
                {r.failed ? (
                  <Pressable onPress={() => send(r.name, r.content)} accessibilityRole="button" accessibilityLabel="Retry sending" style={s.retryBtn}>
                    <Text style={s.retry} numberOfLines={1}>Not sent. Tap to retry</Text>
                  </Pressable>
                ) : (
                  <Text style={s.time} numberOfLines={1} accessibilityLabel={fullDate(r.creation)}>{r.pending ? 'Sending...' : ago(r.creation)}</Text>
                )}
              </View>
              <LinkText text={r.content} style={s.body} />
            </View>
          </View>
        );
      })}
    </Card>
  );
}

/** The input, pinned under the page. Return sends (Shift+Return adds a line on web). */
export function CommentComposer({ thread }: { thread: Thread }) {
  const { text, setText, submit, inputRef } = thread;
  const insets = useSafeAreaInsets();
  const can = !!text.trim();
  return (
    <View style={[s.composer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <TextInput
        ref={inputRef}
        style={s.input}
        value={text}
        onChangeText={setText}
        placeholder="Write a comment"
        placeholderTextColor={COLORS.textMuted}
        multiline
        numberOfLines={1}
        maxLength={2000}
        returnKeyType="send"
        submitBehavior="submit"
        onSubmitEditing={submit}
        accessibilityLabel="Write a comment"
      />
      <Pressable
        onPress={submit}
        disabled={!can}
        accessibilityRole="button"
        accessibilityLabel="Send comment"
        accessibilityState={{ disabled: !can }}
        style={({ pressed }) => [s.send, !can && { opacity: 0.35 }, pressed && { opacity: 0.8 }]}
      >
        <Ionicons name="arrow-up" size={22} color="#fff" />
      </Pressable>
    </View>
  );
}

/** Self-contained list plus inline composer, for screens that do not pin the composer. */
export function CommentThread({ doctype, name }: { doctype: string; name: string; refreshKey?: number }) {
  const thread = useComments(doctype, name);
  return (
    <>
      <CommentList thread={thread} />
      <CommentComposer thread={thread} />
    </>
  );
}

const s = StyleSheet.create({
  item: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  itemBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  itemBody: { flex: 1, gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  who: { flexShrink: 1, fontFamily: fontFamily.semiBold, fontSize: fontSize.sm, color: COLORS.text },
  time: { flexShrink: 0, fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: COLORS.textMuted },
  body: { fontFamily: fontFamily.regular, fontSize: fontSize.md, lineHeight: 21, color: COLORS.text },
  dim: { opacity: 0.55 },
  errorBox: { minHeight: 44, justifyContent: 'center', marginBottom: spacing.sm },
  error: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.danger },
  retryBtn: { minHeight: 32, justifyContent: 'center' },
  retry: { fontFamily: fontFamily.semiBold, fontSize: fontSize.xs, color: COLORS.danger },
  empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg },
  emptyTitle: { fontFamily: fontFamily.semiBold, fontSize: fontSize.md, color: COLORS.text, marginTop: spacing.xs },
  emptyText: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: COLORS.textMuted, textAlign: 'center' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: COLORS.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingHorizontal: spacing.lg,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 22,
    backgroundColor: COLORS.bgMuted,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.md,
    color: COLORS.text,
  },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.text, alignItems: 'center', justifyContent: 'center' },
});
